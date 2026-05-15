---
name: swagger-api-docs
description: Expose Swagger UI in the .NET API service for all environments, not just Development
metadata:
  type: todo
  area: api
  priority: medium
  status: pending
  created: 2026-05-15
---

## Task

Add a Swagger/OpenAPI documentation page to the .NET API service so endpoints can be explored and tested conveniently without writing curl commands.

## Current State

Swashbuckle is already installed (packages present in `apps/api`) and registered in `Program.cs`:
```csharp
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
```

But the UI is only served in Development:
```csharp
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

## What Needs To Change

Option A — Always serve Swagger (simplest, fine for a private side project):
- Remove the `if (app.Environment.IsDevelopment())` guard in `apps/api/Program.cs`
- Swagger UI will be available at `http://localhost:5000/swagger` in all environments

Option B — Serve behind a feature flag / config switch (more controlled):
- Add `"EnableSwagger": true` to `appsettings.json`
- Check the flag in `Program.cs` instead of environment check
- Disable in production `appsettings.Production.json`

Option C — Add XML doc comments to endpoints (full docs, more effort):
- Enable `<GenerateDocumentationFile>` in the .csproj
- Add `<IncludeXmlComments>` to `SwaggerGen` options
- Annotate endpoint handlers with `/// <summary>` and ProducesResponseType attributes

**Recommended**: Option A is sufficient for a personal side project — just remove the environment guard.

## Files to Change

- `apps/api/Program.cs` lines 102–106

## Acceptance Criteria

- `GET http://localhost:5000/swagger/index.html` returns 200 (regardless of `ASPNETCORE_ENVIRONMENT`)
- All six endpoint groups are listed: entries, sources, jobs, alert-rules, notifications, stats
- Each endpoint shows its HTTP method, path, and parameter types
