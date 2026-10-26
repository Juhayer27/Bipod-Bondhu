export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        app: "Bipod Bondhu",
        message: "Backend is running"
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "Bipod Bondhu backend is running!",
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      }
    );
  }
};
