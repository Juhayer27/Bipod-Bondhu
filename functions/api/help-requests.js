function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function toPublicRequest(row) {
  return {
    id: row.id,
    type: row.help_type,
    title: row.title,
    details: row.details,
    area: row.area,
    bloodGroup: row.blood_group,
    units: row.blood_units,
    status: row.status,
    createdAt: row.created_at
  };
}

export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(
      `SELECT id, help_type, title, details, area,
              blood_group, blood_units, status, created_at
       FROM help_requests
       WHERE status = 'active'
       ORDER BY id DESC
       LIMIT 100`
    ).all();

    return json({
      success: true,
      requests: result.results.map(toPublicRequest)
    });
  } catch {
    return json({
      success: false,
      message: "সাহায্যের পোস্ট লোড করা যায়নি।"
    }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    const type = String(data.type || data.helpType || "").trim();
    const title = String(data.title || "").trim();
    const details = String(data.details || "").trim();
    const area = String(data.area || "").trim();
    const phone = String(data.phone || "").trim();
    const bloodGroup = String(data.bloodGroup || "").trim();
    const units = Number(data.units);

    const isBlood = type === "রক্তদাতা প্রয়োজন";

    if (
      !["রক্তদাতা প্রয়োজন", "জরুরি সাহায্য",
        "সাধারণ মানবিক সাহায্য"].includes(type) ||
      title.length < 3 || title.length > 120 ||
      !details || details.length > 3000 ||
      !area || area.length > 200 ||
      !/^[0-9+\-\s()]{7,20}$/.test(phone)
    ) {
      return json({
        success: false,
        message: "তথ্যগুলো যাচাই করে আবার চেষ্টা করুন।"
      }, 400);
    }

    if (
      isBlood &&
      (!["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
        .includes(bloodGroup) ||
       !Number.isInteger(units) || units < 1 || units > 20)
    ) {
      return json({
        success: false,
        message: "রক্তের গ্রুপ ও ব্যাগের সংখ্যা সঠিকভাবে দিন।"
      }, 400);
    }

    const result = await env.DB.prepare(
      `INSERT INTO help_requests
       (help_type, title, details, area, phone,
        blood_group, blood_units)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      type, title, details, area, phone,
      isBlood ? bloodGroup : null,
      isBlood ? units : null
    ).run();

    return json({
      success: true,
      id: result.meta.last_row_id,
      message: "সাহায্যের পোস্ট সংরক্ষিত হয়েছে।"
    }, 201);
  } catch {
    return json({
      success: false,
      message: "পোস্ট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"
    }, 500);
  }
}
