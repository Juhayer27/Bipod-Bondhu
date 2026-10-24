"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const API_URL =
    "https://bipod-bondhu-api.entropicmind.workers.dev/api/help-requests";

  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  const helpType = document.getElementById("helpType");
  const bloodFields = document.getElementById("bloodFields");
  const bloodGroup = document.getElementById("bloodGroup");
  const units = document.getElementById("units");
  const helpForm = document.getElementById("helpForm");
  const donorForm = document.getElementById("donorForm");
  const volunteerForm = document.getElementById("volunteerForm");
  const requestList = document.getElementById("requestsList");

  const year = document.getElementById("currentYear");
  if (year) year.textContent = new Date().getFullYear();

  function showMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  // Mobile navigation
  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      const open = navLinks.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.textContent = open ? "×" : "☰";
    });

    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";
      });
    });
  }

  // Blood-specific fields
  function updateBloodFields() {
    if (!helpType || !bloodFields || !bloodGroup || !units) return;

    const isBlood = helpType.value === "রক্তদাতা প্রয়োজন";
    bloodFields.hidden = !isBlood;
    bloodGroup.required = isBlood;
    units.required = isBlood;

    if (!isBlood) {
      bloodGroup.value = "";
      units.value = "";
    }
  }

  if (helpType) {
    helpType.addEventListener("change", updateBloodFields);
    updateBloodFields();
  }

  function showEmptyState(message) {
    if (!requestList) return;
    requestList.replaceChildren(
      makeElement("p", "empty-state", message)
    );
  }

  function renderRequest(data) {
    const type = data.help_type || data.type || data.helpType || "";
    const titleText = data.title || "";
    const detailsText = data.details || "";
    const area = data.area || "";
    const blood = data.blood_group || data.bloodGroup || "";
    const bloodUnits = data.blood_units ?? data.units ?? "";

    const card = makeElement("article", "request-card");
    card.append(
      makeElement("span", "request-tag", type),
      makeElement("h3", "", titleText),
      makeElement("p", "", detailsText)
    );

    const meta = makeElement("div", "request-meta");
    meta.append(makeElement("p", "", "এলাকা: " + area));
    meta.append(makeElement(
      "p", "", "যোগাযোগের নম্বর প্রকাশ করা হয়নি।"
    ));

    if (blood) {
      meta.append(makeElement("p", "", "রক্তের গ্রুপ: " + blood));
    }

    if (bloodUnits !== "" && bloodUnits !== null) {
      meta.append(makeElement("p", "", "পরিমাণ: " + bloodUnits));
    }

    const actions = makeElement("div", "request-actions");
    const share = makeElement("a", "btn btn-primary", "WhatsApp-এ শেয়ার");

    const shareText = [
      "BIPOD BONDHU — সাহায্যের অনুরোধ",
      "ধরন: " + type,
      "শিরোনাম: " + titleText,
      "বিস্তারিত: " + detailsText,
      "এলাকা: " + area,
      blood ? "রক্তের গ্রুপ: " + blood : "",
      bloodUnits ? "পরিমাণ: " + bloodUnits : "",
      "",
      "অনুগ্রহ করে তথ্য যাচাই করে যোগাযোগ করুন।"
    ].filter(Boolean).join("\n");

    share.href = "https://wa.me/?text=" + encodeURIComponent(shareText);
    share.target = "_blank";
    share.rel = "noopener noreferrer";

    actions.append(share);
    card.append(meta, actions);
    requestList.append(card);
  }

  async function loadRequests() {
    if (!requestList) return;

    showEmptyState("সাহায্যের পোস্ট লোড হচ্ছে...");

    try {
      const response = await fetch(API_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "পোস্ট লোড করা যায়নি।");
      }

      requestList.replaceChildren();

      if (!Array.isArray(result.requests) || !result.requests.length) {
        showEmptyState(
          "এখনো কোনো সাহায্যের পোস্ট নেই। প্রয়োজন হলে প্রথম পোস্টটি তৈরি করুন।"
        );
        return;
      }

      result.requests.forEach(renderRequest);
    } catch (error) {
      console.error("Load requests error:", error);
      showEmptyState(
        "পোস্ট লোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
      );
    }
  }

  // Submit help request
  if (helpForm) {
    helpForm.addEventListener("submit", async event => {
      event.preventDefault();

      if (!helpForm.reportValidity()) return;

      const formData = new FormData(helpForm);
      const request = {
        type: String(formData.get("helpType") || "").trim(),
        title: String(formData.get("helpTitle") || "").trim(),
        details: String(formData.get("helpDetails") || "").trim(),
        area: String(formData.get("helpArea") || "").trim(),
        phone: String(formData.get("helpContact") || "").trim(),
        bloodGroup: String(formData.get("bloodGroup") || "").trim(),
        units: String(formData.get("units") || "").trim()
      };

      if (!request.title || !request.details ||
          !request.area || !request.phone) {
        showMessage("helpMessage", "সব প্রয়োজনীয় তথ্য পূরণ করুন।", true);
        return;
      }

      const button = helpForm.querySelector('button[type="submit"]');
      const oldText = button ? button.textContent : "";

      if (button) {
        button.disabled = true;
        button.textContent = "পোস্ট সংরক্ষণ হচ্ছে...";
      }

      showMessage("helpMessage", "পোস্ট সংরক্ষণ হচ্ছে...");

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(request)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "পোস্ট সংরক্ষণ করা যায়নি।");
        }

        helpForm.reset();
        updateBloodFields();

        showMessage("helpMessage", "সাহায্যের পোস্ট সফলভাবে সংরক্ষিত হয়েছে।");
        await loadRequests();

        const section = document.getElementById("requests");
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (error) {
        console.error("Submit request error:", error);
        showMessage(
          "helpMessage",
          error.message === "Failed to fetch"
            ? "সার্ভারের সঙ্গে সংযোগ করা যায়নি। API ও CORS সেটিং পরীক্ষা করুন।"
            : error.message,
          true
        );
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = oldText;
        }
      }
    });
  }

  // Demo-only donor and volunteer forms
  function setupDemoForm(form, messageId, label) {
    if (!form) return;

    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      showMessage(
        messageId,
        label + " ফর্মটি পূরণ হয়েছে। এটি ডেমো সংস্করণ—তথ্য সংরক্ষণ করা হয়নি।"
      );
      form.reset();
    });
  }

  setupDemoForm(donorForm, "donorMessage", "রক্তদাতা নিবন্ধন");
  setupDemoForm(volunteerForm, "volunteerMessage", "ভলান্টিয়ার নিবন্ধন");

  loadRequests();
});
