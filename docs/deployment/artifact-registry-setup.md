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

---

## Troubleshooting: Real Errors Encountered During First Setup

This section documents errors hit during the initial CI/CD setup and their root causes.
Preserved here because the errors are non-obvious and the fixes reveal important GCP concepts.

---

### Error 1: `must specify exactly one of "workload_identity_provider" or "credentials_json"`

**Full error:**
```
Error: google-github-actions/auth failed with: the GitHub Action workflow must specify
exactly one of "workload_identity_provider" or "credentials_json"!
```

**Root cause:**
The `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret was missing or empty. When a GitHub
Secret is not set, `${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}` evaluates to an empty
string. The auth action then sees neither `workload_identity_provider` nor
`credentials_json` set and throws this error.

**Why this can appear suddenly after working before:**
GitHub Secrets can be accidentally deleted (e.g. during a repo settings change, team
member cleanup, or repo transfer). The workflow file is fine — the resource just disappeared.

**Fix:**
Add (or re-add) all 3 GCP secrets in GitHub → Settings → Secrets and variables → Actions:
- `GCP_PROJECT_ID` = `project-c67469b2-5925-4167-b6a`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `projects/958055060147/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `GCP_SERVICE_ACCOUNT` = `github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com`

**How to find your project number** (different from project ID):
```bash
# In GCP Cloud Shell or local gcloud:
gcloud projects describe project-c67469b2-5925-4167-b6a --format="value(projectNumber)"
# Or: GCP Console → Home Dashboard → "Project number" field
```
Project number for this project: **958055060147**

---

### Error 2: `"invalid_target" — pool or provider is disabled or deleted or doesn't exist`

**Full error:**
```
Error: google-github-actions/auth failed with: failed to generate Google Cloud federated
token for //iam.googleapis.com/...: {"error":"invalid_target","error_description":"The
target service indicated by the \"audience\" parameters is invalid. This might either be
because the pool or provider is disabled or deleted or because it doesn't exist."}
```

**Root cause:**
The Workload Identity Pool (`github-pool`) and Provider (`github-provider`) were never
created on GCP, even though the secret value pointing to them was correctly formatted.
GCP has no record of these resources so it rejects the token exchange.

**Why this is confusing:**
The secret value format looks valid (`projects/NUMBER/locations/global/...`) so the
GitHub Actions step appears to start correctly — the error only surfaces when GCP is
actually contacted. The secret is a *pointer* to a GCP resource; the resource itself
must exist independently.

**Fix — run in GCP Cloud Shell (https://console.cloud.google.com → `>_` icon):**
```bash
# 1. Create the WIF Pool
gcloud iam workload-identity-pools create github-pool \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 2. Create the OIDC Provider (scoped to this repo only)
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="project-c67469b2-5925-4167-b6a" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --attribute-condition="assertion.repository=='NghiaMyst/web-crawler'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 3. Create the service account (if it also doesn't exist yet — see Error 3)
gcloud iam service-accounts create github-ci \
  --display-name="GitHub Actions CI" \
  --project="project-c67469b2-5925-4167-b6a"

gcloud projects add-iam-policy-binding "project-c67469b2-5925-4167-b6a" \
  --member="serviceAccount:github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# 4. Bind service account to the pool
gcloud iam service-accounts add-iam-policy-binding \
  "github-ci@project-c67469b2-5925-4167-b6a.iam.gserviceaccount.com" \
  --project="project-c67469b2-5925-4167-b6a" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/958055060147/locations/global/workloadIdentityPools/github-pool/attribute.repository/NghiaMyst/web-crawler"
```

---

### Error 3: `NOT_FOUND: Unknown service account` when binding WIF

**Full error:**
```
ERROR: (gcloud.iam.service-accounts.add-iam-policy-binding) NOT_FOUND: Unknown service account.
```

**Root cause:**
The `github-ci` service account was never created (Step 3 of this guide was skipped).
The WIF binding command references it, so GCP returns NOT_FOUND.

**Fix:**
Run the service account creation commands from Step 3 before running the WIF binding
in Step 6. The order matters: service account → WIF pool → WIF provider → binding.

---

### Error 4: `IAM Service Account Credentials API has not been used … or it is disabled`

**Full error:**
```
Error: google-github-actions/auth failed with: failed to generate Google Cloud OAuth 2.0
Access Token for ...: {"error":{"code":403,"message":"IAM Service Account Credentials API
has not been used in project 958055060147 before or it is disabled.","status":"PERMISSION_DENIED"}}
```

**Root cause:**
GCP APIs must be explicitly enabled per project before use. Even though the WIF pool,
provider, and service account all exist correctly, generating an OAuth 2.0 access token
for a service account requires the `iamcredentials.googleapis.com` API to be enabled.
This API is what allows one identity (the WIF token) to impersonate a service account.

**Why this is easy to miss:**
Step 1 of this guide enables both APIs, but if that step was skipped or the project was
recreated, the API will be absent. The error doesn't appear until the pool and provider
are both working — it's the last gate in the auth chain.

**Fix:**
```bash
gcloud services enable iamcredentials.googleapis.com \
  --project="project-c67469b2-5925-4167-b6a"
```
Wait ~30 seconds for propagation, then re-trigger the workflow.

**GCP API concept:**
GCP is designed so that no API is available by default — each one must be opted into.
This is a security and billing control: you can audit exactly which services are active
in a project and disable ones you don't use. The two APIs required for this CI/CD setup:
- `artifactregistry.googleapis.com` — allows reading/writing Docker images
- `iamcredentials.googleapis.com` — allows service account impersonation via WIF

---

### Error 5: `dotnet restore` fails — `MSB1003: Specify a project or solution file`

**Full error (in Docker build):**
```
#13 [build 4/7] RUN dotnet restore
#13 0.259 MSBUILD : error MSB1003: Specify a project or solution file. The current working
directory does not contain a project or solution file.
```

**Root cause:**
The `api` Dockerfile was written assuming the Docker build context is `apps/api/`:
```dockerfile
COPY *.csproj ./   # expects *.csproj at the root of the build context
RUN dotnet restore
```
But the CI workflow was passing the monorepo root (`.`) as the build context for all
apps. Since there is no `.csproj` file at the repo root, `COPY *.csproj ./` copies
nothing, and `dotnet restore` finds no project file.

**Why the crawler didn't have this problem:**
The crawler Dockerfile was explicitly written for the monorepo root context — it
copies `package.json`, `pnpm-workspace.yaml`, and `packages/shared-types/` which are
all at the repo root. The api has no monorepo dependencies and needs only `apps/api/`.

**Fix — per-app build context in the workflow matrix:**

Each app declares its own `context` in `.github/workflows/deploy.yml`:
```yaml
strategy:
  matrix:
    include:
      # crawler needs monorepo root — copies workspace-level files
      - app: crawler
        dockerfile: apps/crawler/Dockerfile
        context: .
      # api is standalone .NET — context scoped to apps/api/
      - app: api
        dockerfile: apps/api/Dockerfile
        context: apps/api
```

The build step uses `context: ${{ matrix.context }}` instead of a hardcoded `context: .`.

**General rule:**
When a Dockerfile uses `COPY *.ext ./` or `COPY . ./` without path prefixes, the build
context must be the directory those files live in. If you need files from multiple
directories (shared libraries, workspace config), use the monorepo root as context and
prefix all `COPY` paths explicitly (e.g. `COPY apps/api/*.csproj apps/api/`).

---

### Error 6: `docker pull` permission denied on GCE VM — `artifactregistry.repositories.downloadArtifacts` denied

**Full error:**
```
Error response from daemon: error from registry: Permission
'artifactregistry.repositories.downloadArtifacts' denied on resource (or it may not exist).
```

**Root cause:**
GCE VMs run as a Compute Engine service account (e.g.
`958055060147-compute@developer.gserviceaccount.com`). When `gcloud auth configure-docker`
is run on the VM, Docker uses this service account to authenticate — not the human user
account. The Compute Engine default service account has no Artifact Registry access by
default.

Granting `roles/artifactregistry.reader` to the human user account
(e.g. `user:nghianguyentrong1211@gmail.com`) does NOT help because Docker on the VM
authenticates as the service account, not the human user.

**How to verify which account the VM is using:**
```bash
# SSH into the VM, then:
gcloud config get-value account
# Expected: 958055060147-compute@developer.gserviceaccount.com (not your user email)
```

**Fix — grant the VM's service account Artifact Registry reader (run in Cloud Shell):**
```bash
gcloud projects add-iam-policy-binding "project-c67469b2-5925-4167-b6a" \
  --member="serviceAccount:958055060147-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

This is the correct long-term setup. The VM authenticates automatically via the GCP
metadata server — no `gcloud auth login` needed on the VM, and credentials never expire.

**Why `docker compose pull` showed "Skipped" instead of an error:**
When Docker can't authenticate to pull an image, `docker compose pull` silently marks it
as "Skipped No image to be pulled" rather than failing loudly. This masked the permission
error and made it appear as though the images were already up to date. The real failure
only surfaced when `docker compose up` tried to start a container with an image tag that
didn't exist locally.
