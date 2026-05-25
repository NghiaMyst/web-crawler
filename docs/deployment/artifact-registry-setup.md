# GCP Artifact Registry + Workload Identity Federation Setup

One-time runbook for setting up GCP infrastructure before CI/CD can work.
Every command has the real project ID already substituted in — no variable replacement needed.

Run these commands once from your local machine (or GCP Cloud Shell if gcloud is not installed locally).

---

## Prerequisites

- gcloud CLI installed
  - Local: `snap install google-cloud-cli` or download from https://cloud.google.com/sdk/docs/install
  - Cloud Shell: already available at https://console.cloud.google.com (click the terminal icon)
- Authenticated and project set:
  ```bash
  gcloud auth login
  gcloud config set project project-c67469b2-5925-4167-b6a
  ```
- Verify you are in the right project:
  ```bash
  gcloud config get-value project
  # Expected: project-c67469b2-5925-4167-b6a
  ```

---

## Step 1: Enable Required APIs

```bash
gcloud services enable iamcredentials.googleapis.com artifactregistry.googleapis.com \
  --project="project-c67469b2-5925-4167-b6a"
```

Wait ~30 seconds for the APIs to activate. Verify:
```bash
gcloud services list --enabled --filter="name:artifactregistry.googleapis.com OR name:iamcredentials.googleapis.com" \
  --project="project-c67469b2-5925-4167-b6a"
```

---

## Step 2: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create webcrawler \
  --repository-format=docker \
  --location=asia-southeast1 \
  --description="Web crawler Docker images" \
  --project="project-c67469b2-5925-4167-b6a"
```

Verify the repository was created:
```bash
gcloud artifacts repositories list \
  --location=asia-southeast1 \
  --project="project-c67469b2-5925-4167-b6a"
```

The registry hostname for image paths will be:
```
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler
```

---

## Step 3: Create Service Account for GitHub Actions CI

```bash
gcloud iam service-accounts create github-ci \
  --display-name="GitHub Actions CI" \
  --project="project-c67469b2-5925-4167-b6a"
```

Grant the Artifact Registry writer role so CI can push images:
```bash
gcloud projects add-iam-policy-binding "project-c67469b2-5925-4167-b6a" \
  --member="serviceAccount:github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

Verify the service account exists:
```bash
gcloud iam service-accounts describe \
  "github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --project="project-c67469b2-5925-4167-b6a"
```

---

## Step 4: Create Workload Identity Pool

Workload Identity Federation (WIF) is keyless — no JSON credentials file to rotate or leak.
GitHub's OIDC token is exchanged for a short-lived GCP access token at runtime.

```bash
gcloud iam workload-identity-pools create github-pool \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

Verify:
```bash
gcloud iam workload-identity-pools describe github-pool \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global"
```

---

## Step 5: Create OIDC Provider (restricts to this repo only)

The `--attribute-condition` ensures only `NghiaMyst/web-crawler` can exchange tokens.
Other GitHub repos cannot impersonate the `github-ci` service account.

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --attribute-condition="assertion.repository=='NghiaMyst/web-crawler'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

---

## Step 6: Bind Service Account to Pool

First, retrieve the full pool resource name — this value feeds into the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret:

```bash
POOL_ID=$(gcloud iam workload-identity-pools describe github-pool \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --format="value(name)")
echo "Pool resource name: ${POOL_ID}"
# Save this output — you will need it in the next step and for GitHub Secrets
```

The output will look like:
```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool
```

Bind the service account to the pool, restricted to this repository only:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  "github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --project="project-c67469b2-5925-4167-b6a" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/NghiaMyst/web-crawler"
```

The `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret value is:
```
${POOL_ID}/providers/github-provider
```

Full format example:
```
projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

Store this in the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret.

---

## Step 7: Generate SSH Deploy Key for GCE VM

The CI deploy job SSHes into the GCE VM to run `docker compose pull && up -d`.
Generate a dedicated Ed25519 deploy key with no passphrase (required for CI use).

### 7a. Generate the key pair (on your local machine — not the VM):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gce_deploy_key -N ""
```

This creates:
- `~/.ssh/gce_deploy_key` — private key (store as `GCE_SSH_PRIVATE_KEY` GitHub Secret)
- `~/.ssh/gce_deploy_key.pub` — public key (add to VM's `authorized_keys`)

### 7b. Add the public key to the GCE VM's authorized_keys:

```bash
# Print the public key
cat ~/.ssh/gce_deploy_key.pub
```

SSH into the VM and append the key:
```bash
ssh nghianguyentrong1211@34.87.36.185
# Once on the VM:
echo "ssh-ed25519 AAAA... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
exit
```

Or use `ssh-copy-id` if you have existing SSH access:
```bash
ssh-copy-id -i ~/.ssh/gce_deploy_key.pub nghianguyentrong1211@34.87.36.185
```

### 7c. Get the VM's host fingerprint (for `GCE_SSH_KNOWN_HOSTS` secret):

```bash
ssh-keyscan -H 34.87.36.185
```

Copy the full output (multi-line). This becomes the `GCE_SSH_KNOWN_HOSTS` GitHub Secret.

### 7d. Store secrets in GitHub:

```
GCE_SSH_PRIVATE_KEY  = contents of ~/.ssh/gce_deploy_key (full -----BEGIN ... block)
GCE_SSH_KNOWN_HOSTS  = full output of ssh-keyscan -H 34.87.36.185
```

---

## Step 8: Smoke Test

After completing all steps above, verify everything is wired correctly:

### Verify Artifact Registry repository exists:
```bash
gcloud artifacts repositories describe webcrawler \
  --location=asia-southeast1 \
  --project="project-c67469b2-5925-4167-b6a"
```

### Test SSH access to the GCE VM:
```bash
ssh -i ~/.ssh/gce_deploy_key nghianguyentrong1211@34.87.36.185 \
  "echo 'SSH OK' && docker info --format '{{.ServerVersion}}'"
```

Expected: prints `SSH OK` followed by the Docker version (e.g. `29.5.0`).

### Verify Docker can authenticate to Artifact Registry from the VM:
```bash
ssh -i ~/.ssh/gce_deploy_key nghianguyentrong1211@34.87.36.185 \
  "gcloud auth configure-docker asia-southeast1-docker.pkg.dev --quiet && echo 'Docker auth OK'"
```

This must be run once on the VM before `docker compose pull` can fetch images from Artifact Registry.

### Verify WIF binding (optional — run after first CI workflow):
```bash
# After the first successful GitHub Actions run, check the IAM binding:
gcloud iam service-accounts get-iam-policy \
  "github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --project="project-c67469b2-5925-4167-b6a"
```

---

## Image Naming Convention

Once CI is running, images are tagged with the full git commit SHA and pushed to Artifact Registry.
The `IMAGE_TAG` variable in `.env.prod` is updated by the deploy script on each run.

```
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/crawler:<sha>
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/crawler:latest

asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/api:<sha>
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/api:latest
```

The `:latest` tag always points to the most recently pushed image.
The `:<sha>` tag provides rollback traceability — you can redeploy any previous commit by setting `IMAGE_TAG=<sha>` in `.env.prod` and running `docker compose up -d`.

Build caching is stored as separate `:cache` tags in the same repository:
```
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/crawler:cache
asia-southeast1-docker.pkg.dev/project-c67469b2-5925-4167-b6a/webcrawler/api:cache
```

---

## References

- [Workload Identity Federation setup guide](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Artifact Registry authentication](https://cloud.google.com/artifact-registry/docs/docker/authentication)
- [google-github-actions/auth README](https://github.com/google-github-actions/auth)
- `.github/secrets.md` — lists all 7 GitHub Secrets with descriptions and where to get each value
