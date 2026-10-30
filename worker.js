const allowedTypes = ["blood", "urgent", "general"];

const bloodGroups = [
  "A+", "A-", "B+", "B-",
  "AB+", "AB-", "O+", "O-"
];

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });

function normalizePhone(value) {
  let phone = String(value || "").replace(/[\s()-]/g, "");

  if (phone.startsWith("+880")) {
    phone = "0" + phone.slice(4);
  } else if (phone.startsWith("880")) {
    phone = "0" + phone.slice(3);
  }

  return phone;
}

function validPhone(phone) {
  return /^01[3-9]\d{8}$/.test(phone);
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };

    const respond = (data, status = 200) =>
      json(data, status, corsHeaders);

    if (method === "OPTIONS" && path.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (path === "/api/health" && method === "GET") {
      return respond({
        ok: true,
        app: "Bipod Bondhu",
        message: "Backend is running",
        databaseConfigured: Boolean(env.DB)
      });
    }

    if (!path.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);

      return new Response("Bipod Bondhu backend is running!", {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    if (!env.DB) {
      return respond({
        ok: false,
        error: "Database is not configured."
      }, 500);
    }

    // =========================================
    // EMERGENCY REQUESTS — EXISTING SYSTEM
    // =========================================

    if (path === "/api/requests" && method === "GET") {
      try {
        const type = url.searchParams.get("type");
        let sql = `
          SELECT id, type, title, description, name, phone,
          address, blood_group, bags_needed, status, created_at
          FROM emergency_requests
          WHERE status = 'active'
        `;
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

        const result = await env.DB.prepare(sql)
          .bind(...values)
          .all();

        return respond({
          ok: true,
          requests: result.results || []
        });
      } catch (error) {
        return respond({
          ok: false,
          error: "পোস্ট লোড করা যায়নি।"
        }, 500);
      }
    }

    if (path === "/api/requests" && method === "POST") {
      try {
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

        const type = clean(data.type, 20);
        const title = clean(data.title, 160);
        const description = clean(data.description, 3000);
        const name = clean(data.name, 100);
        const phone = clean(data.phone, 30);
        const address = clean(data.address, 300);

        const bloodGroup = clean(data.blood_group, 5);
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
          !title || !description || !name ||
          !phone || !address
        ) {
          return respond({
            ok: false,
            error: "সব প্রয়োজনীয় তথ্য পূরণ করো।"
          }, 400);
        }

        if (type === "blood") {
          if (
            !bloodGroups.includes(bloodGroup) ||
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
          id, type, title, description, name,
          phone, address,
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

    // =========================================
    // BLOOD DONORS
    // =========================================

    if (path === "/api/donors" && method === "GET") {
      try {
        const group = url.searchParams.get("blood_group");
        const area = clean(url.searchParams.get("area"), 100);
        const q = clean(url.searchParams.get("q"), 100);

        let sql = `
          SELECT id, name, phone, blood_group, address, created_at
          FROM blood_donors
          WHERE status = 'active'
        `;
        const values = [];

        if (group) {
          if (!bloodGroups.includes(group)) {
            return respond({
              ok: false,
              error: "Invalid blood group."
            }, 400);
          }

          sql += " AND blood_group = ?";
          values.push(group);
        }

        if (area) {
          sql += " AND address LIKE ?";
          values.push(`%${area}%`);
        }

        if (q) {
          sql += " AND (name LIKE ? OR address LIKE ?)";
          values.push(`%${q}%`, `%${q}%`);
        }

        sql += " ORDER BY created_at DESC LIMIT 200";

        const result = await env.DB.prepare(sql)
          .bind(...values)
          .all();

        return respond({
          ok: true,
          donors: result.results || []
        });
      } catch (error) {
        return respond({
          ok: false,
          error: "রক্তদাতাদের তালিকা লোড করা যায়নি।"
        }, 500);
      }
    }

    if (path === "/api/donors" && method === "POST") {
      try {
        const contentType = request.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          return respond({
            ok: false,
            error: "JSON format required."
          }, 415);
        }

        const raw = await request.text();

        if (raw.length > 5000) {
          return respond({
            ok: false,
            error: "তথ্য অনেক বড়।"
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

        const name = clean(data.name, 100);
        const phone = normalizePhone(data.phone);
        const bloodGroup = clean(data.blood_group, 5);
        const address = clean(data.address, 300);

        if (
          !name || !validPhone(phone) ||
          !bloodGroups.includes(bloodGroup) ||
          !address
        ) {
          return respond({
            ok: false,
            error: "নাম, সঠিক ফোন নম্বর, রক্তের গ্রুপ ও ঠিকানা দাও।"
          }, 400);
        }

        if (data.consent !== true) {
          return respond({
            ok: false,
            error: "তথ্য প্রকাশের সম্মতি দিতে হবে।"
          }, 400);
        }

        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO blood_donors
          (id, name, phone, blood_group, address)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, name, phone, bloodGroup, address).run();

        return respond({
          ok: true,
          id,
          message: "রক্তদাতা হিসেবে নিবন্ধন সফল হয়েছে।"
        }, 201);
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          return respond({
            ok: false,
            error: "এই ফোন নম্বর দিয়ে ইতিমধ্যে নিবন্ধন করা হয়েছে।"
          }, 409);
        }

        return respond({
          ok: false,
          error: "রেজিস্ট্রেশন সম্পন্ন করা যায়নি।"
        }, 500);
      }
    }

    // =========================================
    // VOLUNTEERS
    // =========================================

    if (path === "/api/volunteers" && method === "GET") {
      try {
        const area = clean(url.searchParams.get("area"), 100);
        const q = clean(url.searchParams.get("q"), 100);

        let sql = `
          SELECT id, name, phone, address, support_range,
          skills, created_at
          FROM volunteers
          WHERE status = 'active'
        `;
        const values = [];

        if (area) {
          sql += " AND address LIKE ?";
          values.push(`%${area}%`);
        }

        if (q) {
          sql += ` AND (
            name LIKE ? OR address LIKE ?
            OR support_range LIKE ? OR skills LIKE ?
          )`;
          values.push(
            `%${q}%`, `%${q}%`,
            `%${q}%`, `%${q}%`
          );
        }

        sql += " ORDER BY created_at DESC LIMIT 200";

        const result = await env.DB.prepare(sql)
          .bind(...values)
          .all();

        return respond({
          ok: true,
          volunteers: result.results || []
        });
      } catch (error) {
        return respond({
          ok: false,
          error: "স্বেচ্ছাসেবকদের তালিকা লোড করা যায়নি।"
        }, 500);
      }
    }

    if (path === "/api/volunteers" && method === "POST") {
      try {
        const contentType = request.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          return respond({
            ok: false,
            error: "JSON format required."
          }, 415);
        }

        const raw = await request.text();

        if (raw.length > 5000) {
          return respond({
            ok: false,
            error: "তথ্য অনেক বড়।"
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

        const name = clean(data.name, 100);
        const phone = normalizePhone(data.phone);
        const address = clean(data.address, 300);
        const supportRange = clean(data.support_range, 100);
        const skills = clean(data.skills, 500);

        if (
          !name || !validPhone(phone) ||
          !address || !supportRange
        ) {
          return respond({
            ok: false,
            error: "নাম, সঠিক ফোন নম্বর, ঠিকানা ও সহায়তার পরিধি পূরণ করো।"
          }, 400);
        }

        if (data.consent !== true) {
          return respond({
            ok: false,
            error: "তথ্য প্রকাশের সম্মতি দিতে হবে।"
          }, 400);
        }

        const id = crypto.randomUUID();

        await env.DB.prepare(`
          INSERT INTO volunteers
          (id, name, phone, address, support_range, skills)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          id, name, phone, address, supportRange, skills
        ).run();

        return respond({
          ok: true,
          id,
          message: "স্বেচ্ছাসেবক হিসেবে নিবন্ধন সফল হয়েছে।"
        }, 201);
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          return respond({
            ok: false,
            error: "এই ফোন নম্বর দিয়ে ইতিমধ্যে নিবন্ধন করা হয়েছে।"
          }, 409);
        }

        return respond({
          ok: false,
          error: "রেজিস্ট্রেশন সম্পন্ন করা যায়নি।"
        }, 500);
      }
    }

    return respond({
      ok: false,
      error: "API endpoint পাওয়া যায়নি।"
    }, 404);
  }
};
