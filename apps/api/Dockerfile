# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY *.csproj ./
RUN dotnet restore

COPY . ./
RUN dotnet build --configuration Release
RUN dotnet publish --configuration Release --no-build --output /app/publish

# Runtime stage — multi-arch (ARM64 compatible)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
RUN apt-get update && apt-get install -y curl --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish ./

EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000

ENTRYPOINT ["dotnet", "WebCrawlerApi.dll"]
