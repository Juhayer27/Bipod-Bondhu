const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const allowedTypes = ["blood", "urgent", "general"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // Basic CORS support for browser requests
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };

    if (method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers });
    }

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...headers,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });

    // 1. Health check
    if (url.pathname === "/api/health" && method === "GET") {
      return respond({
        ok: true,
        app: "Bipod Bondhu",
        message: "Backend is running",
        databaseConfigured: Boolean(env.DB)
      });
    }

    // 2. Get active emergency requests
    if (url.pathname === "/api/requests" && method === "GET") {
      try {
        if (!env.DB) {
          return respond({
            ok: false,
            error: "Database is not configured."
          }, 500);
        }

        const type = url.searchParams.get("type");
        let sql =
          "SELECT id, type, title, description, name, phone, address, blood_group, bags_needed, status, created_at FROM emergency_requests WHERE status = 'active'";
        const values = [];

        if (type) {
          if (!allowedTypes.includes(type)) {
            return respond({
              ok: false,
              error: "Invalid request type."
            }, 400);
          }

          sql += " AND type = ?";
          values.push(type);
        }

        sql += " ORDER BY created_at DESC LIMIT 100";

        const result = await env.DB
          .prepare(sql)
          .bind(...values)
          .all();

        return respond({
          ok: true,
          requests: result.results || []
        });
      } catch (error) {
        return respond({
          ok: false,
          error: "পোস্ট লোড করা যায়নি। Database configuration পরীক্ষা করুন।"
        }, 500);
      }
    }

    // 3. Create a new emergency request
    if (url.pathname === "/api/requests" && method === "POST") {
      try {
        if (!env.DB) {
          return respond({
            ok: false,
            error: "Database is not configured."
          }, 500);
        }

        const contentType = request.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          return respond({
            ok: false,
            error: "JSON format required."
          }, 415);
        }

        const raw = await request.text();

        if (raw.length > 12000) {
          return respond({
            ok: false,
            error: "পোস্টের তথ্য অনেক বড়।"
          }, 413);
        }

        let data;

        try {
          data = JSON.parse(raw);
        } catch {
          return respond({
            ok: false,
            error: "সঠিক JSON তথ্য পাঠাও।"
          }, 400);
        }

        const type = String(data.type || "").trim();
        const title = String(data.title || "").trim();
        const description = String(data.description || "").trim();
        const name = String(data.name || "").trim();
        const phone = String(data.phone || "").trim();
        const address = String(data.address || "").trim();
        const bloodGroup = String(data.blood_group || "").trim();
        const bags = data.bags_needed === "" ||
          data.bags_needed == null
          ? null
          : Number(data.bags_needed);

        if (!allowedTypes.includes(type)) {
          return respond({
            ok: false,
            error: "সঠিক সহায়তার ধরন নির্বাচন করো।"
          }, 400);
        }

        if (
          !title || title.length > 160 ||
          !description || description.length > 3000 ||
          !name || name.length > 100 ||
          !phone || phone.length > 30 ||
          !address || address.length > 300
        ) {
          return respond({
            ok: false,
            error: "সব প্রয়োজনীয় তথ্য দাও এবং নির্ধারিত সীমার মধ্যে রাখো।"
          }, 400);
        }

        if (type === "blood") {
          const groups = [
            "A+", "A-", "B+", "B-",
            "AB+", "AB-", "O+", "O-"
          ];

          if (
            !groups.includes(bloodGroup) ||
            !Number.isInteger(bags) ||
            bags < 1 || bags > 20
          ) {
            return respond({
              ok: false,
              error: "রক্তের গ্রুপ ও ব্যাগের সংখ্যা সঠিকভাবে দাও।"
            }, 400);
          }
        }

        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO emergency_requests
          (id, type, title, description, name, phone, address,
           blood_group, bags_needed, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `).bind(
          id,
          type,
          title,
          description,
          name,
          phone,
          address,
          type === "blood" ? bloodGroup : null,
          type === "blood" ? bags : null
        ).run();

        return respond({
          ok: true,
          id,
          message: "সহায়তার পোস্ট সংরক্ষিত হয়েছে।"
        }, 201);
      } catch (error) {
        return respond({
          ok: false,
          error: "পোস্ট সংরক্ষণ করা যায়নি। আবার চেষ্টা করো।"
        }, 500);
      }
    }

    // Unknown API route
    if (url.pathname.startsWith("/api/")) {
      return respond({
        ok: false,
        error: "API endpoint পাওয়া যায়নি।"
      }, 404);
    }

    // Serve frontend files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Bipod Bondhu backend is running!", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};
