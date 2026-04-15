using System.Net;

namespace WebCrawlerApi.Tests.Helpers;

/// <summary>
/// A simple HttpMessageHandler that returns a pre-configured response for unit testing.
/// </summary>
public class MockHttpMessageHandler : HttpMessageHandler
{
    private readonly HttpStatusCode _statusCode;
    private readonly string _responseContent;
    private HttpRequestMessage? _lastRequest;
    private string? _lastRequestBody;

    public MockHttpMessageHandler(HttpStatusCode statusCode = HttpStatusCode.NoContent, string responseContent = "")
    {
        _statusCode = statusCode;
        _responseContent = responseContent;
    }

    public HttpRequestMessage? LastRequest => _lastRequest;
    public string? LastRequestBody => _lastRequestBody;

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        _lastRequest = request;
        if (request.Content != null)
        {
            _lastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
        }

        return new HttpResponseMessage(_statusCode)
        {
            Content = new StringContent(_responseContent)
        };
    }
}
