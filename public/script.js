(() => {
  "use strict";

  /*
   * BIPOD BONDHU
   * Emergency requests: Cloudflare Worker API + D1 database.
   * Donors and volunteers: localStorage only.
   * Secure online post deletion is not implemented yet.
   */

  const API_BASE = "https://bipodbondhu.entropicmind27.workers.dev/api";

  const STORAGE = {
    donors: "bb_donors_v1",
    volunteers: "bb_volunteers_v1"
  };

  const categories = {
    blood: { label: "রক্তের প্রয়োজন", badge: "blood" },
    urgent: { label: "জরুরি সহায়তা", badge: "urgent" },
    general: { label: "সাধারণ মানবিক সহায়তা", badge: "general" }
  };

  const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  const hotlines = [
    { name: "জাতীয় জরুরি সেবা", number: "999", description: "পুলিশ, ফায়ার সার্ভিস ও অ্যাম্বুলেন্স-সংক্রান্ত জরুরি সহায়তা" },
    { name: "সরকারি তথ্য ও সেবা", number: "333", description: "সরকারি সেবা ও তথ্যের জন্য" },
    { name: "নারী ও শিশু নির্যাতন প্রতিরোধ", number: "109", description: "নারী ও শিশু নির্যাতন প্রতিরোধে সহায়তা" },
    { name: "শিশু সহায়তা", number: "1098", description: "শিশুদের সহায়তা ও সুরক্ষা" },
    { name: "দুর্যোগের আগাম বার্তা", number: "1090", description: "দুর্যোগ-সংক্রান্ত তথ্য ও সতর্কবার্তা" },
    { name: "সরকারি আইনগত সহায়তা", number: "16430", description: "আইনগত সহায়তা সংক্রান্ত তথ্য" },
    { name: "স্বাস্থ্য বাতায়ন", number: "16263", description: "স্বাস্থ্য পরামর্শ ও স্বাস্থ্যসেবা সংক্রান্ত তথ্য" },
    { name: "কৃষি কল সেন্টার", number: "16123", description: "কৃষি বিষয়ক পরামর্শ" }
  ];

  const $ = (s, root = document) => root.querySelector(s);

  const view = $("#app-view");
  const toastEl = $("#toast");
  const dialog = $("#delete-dialog");

  let toastTimer;
  let activePostFilter = "all";
  let remotePosts = [];

  /* =========================
     LOCAL STORAGE
  ========================= */

  function read(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function write(key, items) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      return true;
    } catch {
      showToast("এই ব্রাউজারে তথ্য সংরক্ষণ করা যায়নি।");
      return false;
    }
  }

  function uid() {
    return "bb-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 9);
  }

  /* =========================
     UTILITIES
  ========================= */

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }

  function bn(value) {
    return String(value).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[Number(d)]);
  }

  function dateLabel(value) {
    try {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) return "";

      return new Intl.DateTimeFormat("bn-BD", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch {
      return "";
    }
  }

  function normalizePhone(raw) {
    return String(raw || "").replace(/[^\d+]/g, "");
  }

  function validBDPhone(raw) {
    const p = normalizePhone(raw)
      .replace(/^\+88/, "")
      .replace(/^0088/, "");

    return /^01[3-9]\d{8}$/.test(p);
  }

  function phoneHref(phone) {
    return "tel:" + normalizePhone(phone);
  }

  function waHref(
    phone,
    message = "আসসালামু আলাইকুম, বিপদ বন্ধু ওয়েবসাইটে আপনার তথ্য পেয়েছি।"
  ) {
    let digits = normalizePhone(phone).replace(/\D/g, "");

    if (digits.startsWith("0088")) {
      digits = digits.slice(2);
    }

    if (digits.startsWith("0")) {
      digits = "88" + digits;
    }

    return "https://wa.me/" + digits +
      "?text=" + encodeURIComponent(message);
  }

  function showToast(message) {
    if (!toastEl) return;

    toastEl.textContent = message;
    toastEl.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3600);
  }

  /* =========================
     API FUNCTIONS
  ========================= */

  getRemoteRequests() 
  async function updateStats() {
    $("#stat-donors").textContent =
      bn(read(STORAGE.donors).length);

    $("#stat-volunteers").textContent =
      bn(read(STORAGE.volunteers).length);

    try {
      const rows = await getRemoteRequests();

      $("#stat-posts").textContent = bn(rows.length);
    } catch (error) {
      console.error("Stats loading error:", error);

      $("#stat-posts").textContent = "—";
    }
  }

  function normalizeRemotePost(row) {
    return {
      id: row.id,
      category: row.type || "general",
      name: row.name || "",
      title: row.title || "",
      phone: row.phone || "",
      address: row.address || "",
      description: row.description || "",
      bloodGroup: row.blood_group || "",
      units: row.bags_needed == null
        ? null
        : Number(row.bags_needed),
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  async function fetchRemotePosts() {
    const rows = await getRemoteRequests();

    remotePosts = rows.map(normalizeRemotePost);

    return remotePosts;
  }

  /* =========================
     VIEW MANAGEMENT
  ========================= */

  function renderPlaceholder() {
    view.innerHTML = `
      <div class="view-placeholder">
        <span class="eyebrow">BIPOD BONDHU</span>
        <h2>মানুষ মানুষের জন্য</h2>
        <p>উপরের যেকোনো সেবা নির্বাচন করে শুরু করুন।</p>
      </div>
    `;
  }

  function openView(name) {
    const renderers = {
      create: renderCreateForm,
      posts: renderPosts,
      donors: renderDonors,
      "join-donor": renderDonorForm,
      "join-volunteer": renderVolunteerForm,
      hotlines: renderHotlines
    };

    if (renderers[name]) {
      renderers[name]();

      view.focus({ preventScroll: true });

      view.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } else {
      renderPlaceholder();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  }

  function panelHead(title, subtitle, extra = "") {
    return `
      <div class="panel-head">
        <div>
          <span class="eyebrow">BIPOD BONDHU সেবা</span>
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        ${extra}
      </div>
    `;
  }

  /* =========================
     FORM FIELD GENERATOR
  ========================= */

  function field(label, name, type = "text", options = {}) {
    const full = options.full ? " full" : "";

    const required = options.required === false
      ? ""
      : " required";

    const hint = options.hint
      ? `<span class="field-hint">${options.hint}</span>`
      : "";

    let input = "";

    if (type === "textarea") {
      input = `
        <textarea
          id="${name}"
          name="${name}"
          placeholder="${options.placeholder || ""}"
          ${required}
          ${options.maxlength ? `maxlength="${options.maxlength}"` : ""}
        ></textarea>
      `;
    } else if (type === "select") {
      input = `
        <select id="${name}" name="${name}"${required}>
          ${options.options}
        </select>
      `;
    } else {
      input = `
        <input
          id="${name}"
          name="${name}"
          type="${type}"
          placeholder="${options.placeholder || ""}"
          ${required}
          ${options.maxlength ? `maxlength="${options.maxlength}"` : ""}
          ${options.pattern ? `pattern="${options.pattern}"` : ""}
          ${options.min !== undefined ? `min="${options.min}"` : ""}
          ${options.max !== undefined ? `max="${options.max}"` : ""}
          ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ""}
        >
      `;
    }

    return `
      <div class="field${full}">
        <label for="${name}">
          ${label}
          ${options.required === false ? "" : ' <span class="required">*</span>'}
        </label>
        ${input}
        ${hint}
      </div>
    `;
  }

  function categoryOptions(selected = "blood") {
    return Object.entries(categories).map(([key, item]) =>
      `<option value="${key}" ${key === selected ? "selected" : ""}>
        ${item.label}
      </option>`
    ).join("");
  }

  function bloodOptions(placeholder = "রক্তের গ্রুপ বেছে নিন") {
    return `
      <option value="">${placeholder}</option>
      ${bloodGroups.map(g => `<option value="${g}">${g}</option>`).join("")}
    `;
  }

  /* =========================
     CREATE POST FORM
  ========================= */

  function renderCreateForm() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "সাহায্যের পোস্ট তৈরি করুন",
          "প্রয়োজনীয় তথ্য দিন, যাতে সাহায্য করতে ইচ্ছুক মানুষ আপনার সঙ্গে যোগাযোগ করতে পারেন।"
        )}

        <div class="warning">
          <strong>গুরুত্বপূর্ণ:</strong>
          পোস্ট অনলাইন ডেটাবেসে সংরক্ষিত হবে এবং নাম, ফোন নম্বর ও ঠিকানা প্রকাশিত হতে পারে।
          শুধু প্রয়োজনীয় তথ্য দিন। এই সংস্করণে পোস্ট মুছে ফেলার নিরাপদ সুবিধা এখনো চালু নয়।
        </div>

        <form id="post-form">

          <div class="form-grid">

            ${field("সাহায্যের ধরন", "post-category", "select", {
              options: categoryOptions("blood")
            })}

            ${field("আপনার নাম", "post-name", "text", {
              placeholder: "পূর্ণ নাম",
              maxlength: 80,
              autocomplete: "name"
            })}

            ${field("পোস্টের শিরোনাম", "post-title", "text", {
              placeholder: "যেমন: জরুরি ভিত্তিতে A+ রক্ত প্রয়োজন",
              maxlength: 120
            })}

            ${field("মোবাইল নম্বর", "post-phone", "tel", {
              placeholder: "01XXXXXXXXX",
              pattern: "^(\\+?88)?01[3-9][0-9]{8}$",
              maxlength: 14,
              autocomplete: "tel"
            })}

            ${field("সহায়তার স্থান / ঠিকানা", "post-address", "text", {
              placeholder: "এলাকা, থানা, জেলা",
              maxlength: 180,
              full: true,
              autocomplete: "street-address"
            })}

            <div class="field full">
              <label for="post-description">
                বিস্তারিত বিবরণ <span class="required">*</span>
              </label>

              <textarea
                id="post-description"
                name="post-description"
                required
                maxlength="1800"
                placeholder="কী ধরনের সাহায্য প্রয়োজন, কখন প্রয়োজন এবং প্রাসঙ্গিক তথ্য লিখুন।"
              ></textarea>

              <span class="field-hint">
                ব্যক্তিগত পরিচয়পত্র, ব্যাংক তথ্য বা অপ্রয়োজনীয় সংবেদনশীল তথ্য লিখবেন না।
              </span>
            </div>

            <div class="field full" id="blood-extra" hidden>
              <div class="form-grid">

                ${field("রক্তের গ্রুপ", "post-blood-group", "select", {
                  options: bloodOptions()
                })}

                ${field("কত ব্যাগ রক্ত প্রয়োজন", "post-blood-units", "number", {
                  min: 1,
                  max: 20,
                  placeholder: "যেমন: ২"
                })}

              </div>
            </div>

          </div>

          <div class="field full" style="margin-top:16px">
            <label class="consent-row">
              <input type="checkbox" id="post-consent" required>
              <span>
                আমি নিশ্চিত করছি যে দেওয়া তথ্য যথাসম্ভব সঠিক এবং বুঝতে পারছি যে এই পোস্টে আমার নাম, ফোন নম্বর ও ঠিকানা প্রকাশিত হবে।
              </span>
            </label>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              পোস্ট করুন <span>↗</span>
            </button>

            <button class="btn btn-secondary" type="reset">
              ফর্ম মুছুন
            </button>
          </div>

        </form>
      </section>
    `;

    const category = $("#post-category");
    const bloodExtra = $("#blood-extra");
    const bloodGroup = $("#post-blood-group");
    const units = $("#post-blood-units");

    function syncBloodFields() {
      const show = category.value === "blood";

      bloodExtra.hidden = !show;
      bloodGroup.required = show;
      units.required = show;
    }

    category.addEventListener("change", syncBloodFields);

    syncBloodFields();

    $("#post-form").addEventListener("reset", () => {
      setTimeout(syncBloodFields, 0);
    });

    $("#post-form").addEventListener("submit", submitPost);
  }

  /* =========================
     SUBMIT POST TO DATABASE
  ========================= */

  async function submitPost(event) {
    event.preventDefault();

    const form = event.currentTarget;

    const submitButton = form.querySelector(
      'button[type="submit"]'
    );

    const data = new FormData(form);

    const phone = data.get("post-phone");

    if (!validBDPhone(phone)) {
      showToast("সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন 01XXXXXXXXX)।");
      return;
    }

    const category = String(
      data.get("post-category") || ""
    );

    const post = {
      type: category,

      name: String(
        data.get("post-name") || ""
      ).trim(),

      title: String(
        data.get("post-title") || ""
      ).trim(),

      phone: normalizePhone(phone),

      address: String(
        data.get("post-address") || ""
      ).trim(),

      description: String(
        data.get("post-description") || ""
      ).trim(),

      blood_group: category === "blood"
        ? String(data.get("post-blood-group") || "")
        : null,

      bags_needed: category === "blood"
        ? Number(data.get("post-blood-units"))
        : null
    };

    if (
      !post.name ||
      !post.title ||
      !post.address ||
      !post.description
    ) {
      showToast("সব প্রয়োজনীয় ঘর পূরণ করুন।");
      return;
    }

    if (
      category === "blood" &&
      (
        !post.blood_group ||
        !Number.isInteger(post.bags_needed) ||
        post.bags_needed < 1 ||
        post.bags_needed > 20
      )
    ) {
      showToast("রক্তের গ্রুপ ও ব্যাগের সংখ্যা সঠিকভাবে দিন।");
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "পোস্ট করা হচ্ছে…";
    }

    try {
      const response = await fetch(API_BASE + "/requests", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(post)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.error ||
          result.message ||
          "পোস্ট সংরক্ষণ করা যায়নি।"
        );
      }

      await updateStats();

      view.innerHTML = `
        <section class="panel">

          ${panelHead(
            "পোস্ট তৈরি হয়েছে",
            "আপনার পোস্ট অনলাইন ডেটাবেসে সংরক্ষিত হয়েছে।"
          )}

          <div class="info-box">
            আপনার সাহায্যের পোস্টটি এখন অনলাইনে তালিকায় দেখা যাওয়ার কথা।
            জরুরি পরিস্থিতিতে সরকারি জরুরি সেবা নম্বরেও যোগাযোগ করুন।
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" data-view="posts">
              পোস্টের তালিকা দেখুন
            </button>

            <button class="btn btn-secondary" data-view="create">
              আরেকটি পোস্ট করুন
            </button>
          </div>

        </section>
      `;

      showToast("পোস্ট অনলাইন ডেটাবেসে সংরক্ষিত হয়েছে।");

    } catch (error) {
      console.error("Post submission error:", error);

      showToast(
        error.message ||
        "সার্ভারের সঙ্গে সংযোগ করা যায়নি। আবার চেষ্টা করুন।"
      );

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = 'পোস্ট করুন <span>↗</span>';
      }
    }
  }

  /* =========================
     POST CATEGORY BADGE
  ========================= */

  function categoryBadge(category) {
    const item = categories[category] || categories.general;

    return `
      <span class="badge ${item.badge}">
        ${item.label}
      </span>
    `;
  }

  /* =========================
     RENDER ONLINE POSTS
  ========================= */

  async function renderPosts() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "সকল সাহায্যের পোস্ট",
          "অনলাইনে প্রকাশিত সাহায্যের পোস্ট খুঁজুন।"
        )}

        <div class="warning">
          পোস্টগুলো অনলাইন ডেটাবেস থেকে লোড হয়।
          যোগাযোগের আগে তথ্য যাচাই করুন।
        </div>

        <div class="tabs" role="tablist" aria-label="পোস্টের ধরন">

          <button
            class="tab ${activePostFilter === "all" ? "active" : ""}"
            data-post-filter="all"
          >
            সব পোস্ট
          </button>

          ${Object.entries(categories).map(([key, item]) => `
            <button
              class="tab ${activePostFilter === key ? "active" : ""}"
              data-post-filter="${key}"
            >
              ${item.label}
            </button>
          `).join("")}

        </div>

        <div class="toolbar">

          <input
            id="post-search"
            type="search"
            placeholder="শিরোনাম, এলাকা বা বিবরণ দিয়ে খুঁজুন"
            aria-label="পোস্ট খুঁজুন"
          >

          <select id="post-sort" aria-label="পোস্ট সাজান">
            <option value="new">নতুন পোস্ট আগে</option>
            <option value="old">পুরোনো পোস্ট আগে</option>
          </select>

        </div>

        <div id="posts-list" class="cards-list">
          <div class="empty-state">
            অনলাইন পোস্ট লোড হচ্ছে…
          </div>
        </div>

      </section>
    `;

    const renderList = () => {
      const searchInput = $("#post-search");
      const sortInput = $("#post-sort");
      const list = $("#posts-list");

      if (!searchInput || !sortInput || !list) return;

      const term = searchInput.value.trim().toLowerCase();
      const sort = sortInput.value;

      let filtered = remotePosts.filter(post =>
        activePostFilter === "all" ||
        post.category === activePostFilter
      );

      filtered = filtered.filter(post =>
        [
          post.title,
          post.description,
          post.name,
          post.address,
          post.bloodGroup
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );

      filtered.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime() || 0;
        const dateB = new Date(b.createdAt).getTime() || 0;

        return sort === "new"
          ? dateB - dateA
          : dateA - dateB;
      });

      list.innerHTML = filtered.length
        ? filtered.map(post => `
          <article class="request-card">

            <div class="request-top">
              ${categoryBadge(post.category)}
              <span class="subtle">
                ${dateLabel(post.createdAt)}
              </span>
            </div>

            <h3>${escapeHTML(post.title)}</h3>

            <p>${escapeHTML(post.description)}</p>

            <div class="meta-list">

              <span>
                👤 ${escapeHTML(post.name)}
              </span>

              <span>
                ☎ ${escapeHTML(post.phone)}
              </span>

              <span>
                ⌖ ${escapeHTML(post.address)}
              </span>

              ${
                post.category === "blood"
                  ? `
                    <span>
                      🩸 রক্তের গ্রুপ:
                      <strong>${escapeHTML(post.bloodGroup || "উল্লেখ নেই")}</strong>
                      · ব্যাগ:
                      <strong>${post.units ? bn(post.units) : "উল্লেখ নেই"}</strong>
                    </span>
                  `
                  : ""
              }

            </div>

            <div class="card-actions">

              <a
                class="btn btn-primary btn-small"
                href="${phoneHref(post.phone)}"
              >
                কল করুন
              </a>

              <a
                class="btn btn-secondary btn-small"
                href="${waHref(
                  post.phone,
                  "আসসালামু আলাইকুম, আপনার সাহায্যের পোস্টটি দেখেছি: " + post.title
                )}"
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>

            </div>

          </article>
        `).join("")
        : `
          <div class="empty-state">
            <strong>কোনো পোস্ট পাওয়া যায়নি</strong>
            এই ধরন বা শব্দের সঙ্গে মেলে এমন পোস্ট নেই।
          </div>
        `;

      const counts = {
        all: remotePosts.length
      };

      Object.keys(categories).forEach(key => {
        counts[key] = remotePosts.filter(
          post => post.category === key
        ).length;
      });

      view.querySelectorAll("[data-post-filter]").forEach(btn => {
        const key = btn.dataset.postFilter;

        btn.classList.toggle(
          "active",
          key === activePostFilter
        );

        btn.textContent =
          (key === "all" ? "সব পোস্ট" : categories[key].label) +
          " (" + bn(counts[key] || 0) + ")";
      });
    };

    view.querySelectorAll("[data-post-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        activePostFilter = btn.dataset.postFilter;
        renderList();
      });
    });

    $("#post-search").addEventListener("input", renderList);
    $("#post-sort").addEventListener("change", renderList);

    try {
      await fetchRemotePosts();

      renderList();

    } catch (error) {
      console.error("Post loading error:", error);

      $("#posts-list").innerHTML = `
        <div class="empty-state">
          <strong>পোস্ট লোড করা যায়নি</strong>
          ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
          <br><br>
          <button
            class="btn btn-secondary btn-small"
            id="retry-posts"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      `;

      const retryButton = $("#retry-posts");

      if (retryButton) {
        retryButton.addEventListener("click", renderPosts);
      }

      showToast("অনলাইন পোস্ট লোড করা যায়নি।");
    }
  }

  /* =========================
     DELETE POST
  ========================= */

  function submitDelete(event) {
    event.preventDefault();

    showToast(
      "নিরাপদ পোস্ট-মোছার ব্যবস্থা এখনো তৈরি হয়নি।"
    );
  }

  /* =========================
     DONOR REGISTRATION
  ========================= */

  function renderDonorForm() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "রক্তদাতা হিসেবে যোগ দিন",
          "আপনার তথ্য দিয়ে রক্তদাতাদের তালিকায় যুক্ত হন।"
        )}

        <div class="warning">
          <strong>গোপনীয়তার সতর্কতা:</strong>
          নাম, ঠিকানা, রক্তের গ্রুপ ও ফোন নম্বর তালিকায় প্রকাশিত হবে।
          এই সংস্করণে তথ্য শুধু এই ব্রাউজারে সংরক্ষিত হয়।
        </div>

        <form id="donor-form">

          <div class="form-grid">

            ${field("আপনার নাম", "donor-name", "text", {
              placeholder: "পূর্ণ নাম",
              maxlength: 80,
              autocomplete: "name"
            })}

            ${field("রক্তের গ্রুপ", "donor-group", "select", {
              options: bloodOptions()
            })}

            ${field("মোবাইল নম্বর", "donor-phone", "tel", {
              placeholder: "01XXXXXXXXX",
              pattern: "^(\\+?88)?01[3-9][0-9]{8}$",
              maxlength: 14,
              autocomplete: "tel"
            })}

            ${field("ঠিকানা", "donor-address", "text", {
              placeholder: "এলাকা, থানা, জেলা",
              maxlength: 180,
              autocomplete: "street-address"
            })}

          </div>

          <label class="consent-row">
            <input id="donor-consent" type="checkbox" required>
            <span>
              আমি সম্মতি দিচ্ছি যে আমার নাম, ঠিকানা, ফোন নম্বর ও রক্তের গ্রুপ প্রকাশ্য তালিকায় দেখানো হবে।
            </span>
          </label>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              নিবন্ধন করুন
            </button>

            <button class="btn btn-secondary" type="reset">
              ফর্ম মুছুন
            </button>
          </div>

        </form>
      </section>
    `;

    $("#donor-form").addEventListener("submit", event => {
      event.preventDefault();

      const d = new FormData(event.currentTarget);

      if (!validBDPhone(d.get("donor-phone"))) {
        return showToast("সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।");
      }

      const donor = {
        id: uid(),
        name: String(d.get("donor-name")).trim(),
        group: d.get("donor-group"),
        phone: normalizePhone(d.get("donor-phone")),
        address: String(d.get("donor-address")).trim(),
        createdAt: new Date().toISOString()
      };

      if (!donor.name || !donor.group || !donor.address) {
        return showToast("সব প্রয়োজনীয় ঘর পূরণ করুন।");
      }

      const existing = read(STORAGE.donors);

      if (existing.some(x => x.phone === donor.phone)) {
        return showToast("এই নম্বর দিয়ে একজন রক্তদাতা ইতিমধ্যে যুক্ত আছেন।");
      }

      if (!write(STORAGE.donors, [donor, ...existing])) {
        return;
      }

      updateStats();

      showToast("আপনার তথ্য এই ব্রাউজারে সংরক্ষিত হয়েছে।");

      renderDonors();
    });
  }

  /* =========================
     DONOR LIST
  ========================= */

  function renderDonors() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "রক্তদাতাদের তালিকা",
          "রক্তের গ্রুপ ও এলাকা অনুযায়ী দাতা খুঁজুন।",
          '<button class="text-button" data-view="join-donor">+ রক্তদাতা হিসেবে যোগ দিন</button>'
        )}

        <div class="warning">
          দাতার তথ্য যাচাই করে যোগাযোগ করুন।
          তালিকাটি এই ব্রাউজারের স্থানীয় ডেটা; এটি এখনও সবার জন্য অনলাইনে শেয়ার হয় না।
        </div>

        <div class="toolbar">

          <select id="donor-group-filter" aria-label="রক্তের গ্রুপ">
            <option value="">সব রক্তের গ্রুপ</option>
            ${bloodGroups.map(g => `<option value="${g}">${g}</option>`).join("")}
          </select>

          <input
            id="donor-search"
            type="search"
            placeholder="নাম, এলাকা বা ফোন নম্বর দিয়ে খুঁজুন"
            aria-label="রক্তদাতা খুঁজুন"
          >

        </div>

        <div id="donors-list" class="cards-list"></div>

      </section>
    `;

    const renderList = () => {
      const group = $("#donor-group-filter").value;
      const term = $("#donor-search").value.trim().toLowerCase();

      const filtered = read(STORAGE.donors).filter(d =>
        (!group || d.group === group) &&
        [d.name, d.address, d.phone, d.group]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );

      $("#donors-list").innerHTML = filtered.length
        ? filtered.map(d => `
          <article class="person-card">

            <div class="person-top">
              <div class="avatar">♡</div>

              <div>
                <h3>${escapeHTML(d.name)}</h3>
                <span class="blood-group">${escapeHTML(d.group)}</span>
              </div>
            </div>

            <div class="meta-list">
              <span>⌖ ${escapeHTML(d.address)}</span>
              <span>☎ ${escapeHTML(d.phone)}</span>
            </div>

            <div class="card-actions">

              <a
                class="btn btn-primary btn-small"
                href="${phoneHref(d.phone)}"
              >
                কল করুন
              </a>

              <a
                class="btn btn-secondary btn-small"
                href="${waHref(d.phone)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>

            </div>

          </article>
        `).join("")
        : `
          <div class="empty-state">
            <strong>এখনও কোনো রক্তদাতা নেই</strong>
            এই ব্রাউজারে নিবন্ধিত দাতা পাওয়া যায়নি।
          </div>
        `;
    };

    $("#donor-group-filter").addEventListener("change", renderList);
    $("#donor-search").addEventListener("input", renderList);

    renderList();
  }

  /* =========================
     VOLUNTEER REGISTRATION
  ========================= */

  function renderVolunteerForm() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "ভলান্টিয়ার হিসেবে যোগ দিন",
          "আপনি কোন এলাকায় সহায়তা করতে পারবেন তা জানান।"
        )}

        <div class="warning">
          <strong>প্রকাশ্য তথ্য:</strong>
          আপনার নাম, ফোন নম্বর, ঠিকানা ও সহায়তার এলাকা প্রকাশ্য তালিকায় দেখানো হতে পারে।
          নিরাপত্তার কারণে বাড়ির নির্দিষ্ট নম্বরের বদলে এলাকা/থানা/জেলা লিখুন।
        </div>

        <form id="volunteer-form">

          <div class="form-grid">

            ${field("আপনার নাম", "vol-name", "text", {
              placeholder: "পূর্ণ নাম",
              maxlength: 80,
              autocomplete: "name"
            })}

            ${field("মোবাইল নম্বর", "vol-phone", "tel", {
              placeholder: "01XXXXXXXXX",
              pattern: "^(\\+?88)?01[3-9][0-9]{8}$",
              maxlength: 14,
              autocomplete: "tel"
            })}

            ${field("আপনার এলাকা", "vol-address", "text", {
              placeholder: "এলাকা, থানা, জেলা",
              maxlength: 180,
              autocomplete: "street-address"
            })}

            ${field("কত দূর পর্যন্ত সহায়তা করতে পারবেন?", "vol-range", "select", {
              options: `
                <option value="">এলাকা বেছে নিন</option>
                <option value="5">প্রায় ৫ কিলোমিটার</option>
                <option value="10">প্রায় ১০ কিলোমিটার</option>
                <option value="20">প্রায় ২০ কিলোমিটার</option>
                <option value="district">নিজ জেলা</option>
                <option value="other">অন্যান্য / আলোচনা সাপেক্ষে</option>
              `
            })}

            ${field("কী ধরনের সহায়তা করতে পারবেন? (ঐচ্ছিক)", "vol-skills", "textarea", {
              placeholder: "যেমন: জরুরি যাতায়াত, খাবার, রক্তদাতা খোঁজা",
              required: false,
              maxlength: 500,
              full: true
            })}

          </div>

          <label class="consent-row">
            <input id="vol-consent" type="checkbox" required>
            <span>
              আমি সম্মতি দিচ্ছি যে আমার নাম, ফোন নম্বর, এলাকা ও সহায়তার পরিসর প্রকাশ করা হবে।
            </span>
          </label>

          <div class="form-actions">

            <button class="btn btn-primary" type="submit">
              নিবন্ধন করুন
            </button>

            <button class="btn btn-secondary" type="reset">
              ফর্ম মুছুন
            </button>

          </div>

        </form>
      </section>
    `;

    $("#volunteer-form").addEventListener("submit", event => {
      event.preventDefault();

      const d = new FormData(event.currentTarget);

      if (!validBDPhone(d.get("vol-phone"))) {
        return showToast("সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।");
      }

      const volunteer = {
        id: uid(),
        name: String(d.get("vol-name")).trim(),
        phone: normalizePhone(d.get("vol-phone")),
        address: String(d.get("vol-address")).trim(),
        range: d.get("vol-range"),
        skills: String(d.get("vol-skills") || "").trim(),
        createdAt: new Date().toISOString()
      };

      if (
        !volunteer.name ||
        !volunteer.address ||
        !volunteer.range
      ) {
        return showToast("সব প্রয়োজনীয় ঘর পূরণ করুন।");
      }

      const existing = read(STORAGE.volunteers);

      if (existing.some(x => x.phone === volunteer.phone)) {
        return showToast("এই নম্বর দিয়ে একজন ভলান্টিয়ার ইতিমধ্যে যুক্ত আছেন।");
      }

      if (!write(STORAGE.volunteers, [volunteer, ...existing])) {
        return;
      }

      updateStats();

      showToast("আপনার তথ্য এই ব্রাউজারে সংরক্ষিত হয়েছে।");

      renderVolunteers();
    });
  }

  /* =========================
     VOLUNTEER LIST
  ========================= */

  function renderVolunteers() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "স্বেচ্ছাসেবকদের তালিকা",
          "এলাকা ও সহায়তার ধরন অনুযায়ী স্বেচ্ছাসেবক খুঁজুন।",
          '<button class="text-button" data-view="join-volunteer">+ ভলান্টিয়ার হিসেবে যোগ দিন</button>'
        )}

        <div class="warning">
          এই তালিকা কেবল এই ব্রাউজারের ডেটা দেখায়।
          এলাকা-ভিত্তিক স্বয়ংক্রিয় নোটিফিকেশন চালু করতে অনলাইন ব্যাকএন্ড ও লোকেশন ব্যবস্থা লাগবে।
        </div>

        <div class="toolbar">

          <input
            id="vol-search"
            type="search"
            placeholder="নাম, এলাকা বা সহায়তার ধরন দিয়ে খুঁজুন"
            aria-label="ভলান্টিয়ার খুঁজুন"
          >

        </div>

        <div id="vol-list" class="cards-list"></div>

      </section>
    `;

    const renderList = () => {
      const term = $("#vol-search").value.trim().toLowerCase();

      const filtered = read(STORAGE.volunteers).filter(v =>
        [v.name, v.address, v.skills, v.range]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );

      $("#vol-list").innerHTML = filtered.length
        ? filtered.map(v => `
          <article class="person-card">

            <div class="person-top">

              <div class="avatar">✚</div>

              <div>
                <h3>${escapeHTML(v.name)}</h3>
                <span class="badge">স্বেচ্ছাসেবক</span>
              </div>

            </div>

            <div class="meta-list">

              <span>⌖ ${escapeHTML(v.address)}</span>

              <span>
                সহায়তার পরিসর:
                ${escapeHTML(
                  v.range === "district"
                    ? "নিজ জেলা"
                    : v.range === "other"
                      ? "আলোচনা সাপেক্ষে"
                      : "প্রায় " + v.range + " কিলোমিটার"
                )}
              </span>

              ${v.skills
                ? `<span>সহায়তা: ${escapeHTML(v.skills)}</span>`
                : ""
              }

              <span>☎ ${escapeHTML(v.phone)}</span>

            </div>

            <div class="card-actions">

              <a
                class="btn btn-primary btn-small"
                href="${phoneHref(v.phone)}"
              >
                কল করুন
              </a>

              <a
                class="btn btn-secondary btn-small"
                href="${waHref(v.phone)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>

            </div>

          </article>
        `).join("")
        : `
          <div class="empty-state">
            <strong>এখনও কোনো স্বেচ্ছাসেবক নেই</strong>
            এই ব্রাউজারে নিবন্ধিত স্বেচ্ছাসেবক পাওয়া যায়নি।
          </div>
        `;
    };

    $("#vol-search").addEventListener("input", renderList);

    renderList();
  }

  /* =========================
     HOTLINES
  ========================= */

  function renderHotlines() {
    view.innerHTML = `
      <section class="panel">

        ${panelHead(
          "জাতীয় সহায়তা কেন্দ্র",
          "জরুরি ও গুরুত্বপূর্ণ সরকারি সহায়তা নম্বর।"
        )}

        <div class="warning">
          <strong>সতর্কতা:</strong>
          নম্বর বা সেবার প্রাপ্যতা পরিবর্তিত হতে পারে।
          গুরুত্বপূর্ণ পরিস্থিতিতে কল করার আগে সরকারি উৎস থেকে নম্বর যাচাই করুন।
          জীবন-ঝুঁকির জরুরি অবস্থায় ৯৯৯-এ চেষ্টা করুন।
        </div>

        <div class="hotline-grid">

          ${hotlines.map(h => `
            <article class="hotline-card">

              <div>

                <h3>${escapeHTML(h.name)}</h3>

                <div class="hotline-number">
                  ${escapeHTML(bn(h.number))}
                </div>

                <p>${escapeHTML(h.description)}</p>

              </div>

              <a
                class="btn btn-primary btn-small"
                href="tel:${h.number}"
              >
                কল করুন
              </a>

            </article>
          `).join("")}

        </div>

        <p class="subtle" style="margin-top:18px">
          এই নম্বরগুলো তথ্য সহায়তার জন্য দেওয়া হয়েছে; এটি সরকারি ওয়েবসাইট নয়।
          প্রকাশের আগে প্রতিটি নম্বর ও সেবার বিবরণ সরকারি উৎসে যাচাই করুন।
        </p>

      </section>
    `;
  }

  /* =========================
     GLOBAL NAVIGATION
  ========================= */

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");

    if (nav) {
      event.preventDefault();

      openView(nav.dataset.view);

      return;
    }

    const close = event.target.closest("[data-close-dialog]");

    if (close && dialog) {
      dialog.close();
    }
  });

  /* =========================
     DELETE FORM
  ========================= */

  if ($("#delete-form")) {
    $("#delete-form").addEventListener(
      "submit",
      submitDelete
    );
  }

  /* =========================
     INITIALIZATION
  ========================= */

  const yearElement = $("#year");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  updateStats();

  renderPlaceholder();

})();
