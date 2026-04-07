// Stub Program.cs — full implementation in Plan 01-03
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/health", () => "OK");
app.Run();
