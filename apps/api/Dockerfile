# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY apps/api/*.csproj ./
RUN dotnet restore

COPY apps/api/ ./
RUN dotnet build --configuration Release --no-restore
RUN dotnet publish --configuration Release --no-build --output /app/publish

# Runtime stage — multi-arch (ARM64 compatible)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000

ENTRYPOINT ["dotnet", "WebCrawlerApi.dll"]
