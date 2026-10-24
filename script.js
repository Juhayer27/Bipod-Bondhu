"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const API_URL =
    "https://bipod-bondhu-api.entropicmind.workers.dev/api/help-requests";

  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");
  const helpType = document.getElementById("helpType");
  const bloodFields = document.getElementById("bloodFields");
  const helpForm = document.getElementById("helpForm");
  const donorForm = document.getElementById("donorForm");
  const volunteerForm = document.getElementById("volunteerForm");
  const requestList = document.getElementById("requestList");

  document.getElementById("year").textContent =
    new Date().getFullYear();

  // Mobile navigation
  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "মেনু বন্ধ করুন" : "মেনু খুলুন"
    );
    menuToggle.textContent = isOpen ? "×" : "☰";
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "মেনু খুলুন");
      menuToggle.textContent = "☰";
    });
  });

  // Show blood fields only for blood requests
  function updateBloodFields() {
    const isBloodRequest =
      helpType.value === "রক্তদাতা প্রয়োজন";

    bloodFields.hidden = !isBloodRequest;

    document.getElementById("bloodGroup").required =
      isBloodRequest;

    document.getElementById("units").required =
      isBloodRequest;
  }

  helpType.addEventListener("change", updateBloodFields);
  updateBloodFields();

  function showMessage(elementId, message, isError = false) {
    const element = document.getElementById(elementId);

    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function clearEmptyState() {
    const emptyState =
      requestList.querySelector(".empty-state");

    if (emptyState) {
      emptyState.remove();
    }
  }

  function showEmptyState(message) {
    requestList.replaceChildren(
      makeElement("p", "empty-state", message)
    );
  }

  // Convert database response fields to frontend fields
  function normalizeRequest(data) {
    return {
      id: data.id,
      type: data.help_type || data.type || data.helpType || "",
      title: data.title || "",
      details: data.details || "",
      area: data.area || "",
      phone: data.phone || "",
      bloodGroup: data.blood_group || data.bloodGroup || "",
      units: data.blood_units ?? data.units ?? ""
    };
  }

  // Create a request card safely
  function renderRequest(rawRequest, addToTop = true) {
    const request = normalizeRequest(rawRequest);

    const card = makeElement("article", "request-card");
    const tag = makeElement("span", "request-tag", request.type);
    const title = makeElement("h3", "", request.title);
    const details = makeElement("p", "", request.details);
    const meta = makeElement("div", "request-meta");

    meta.append(
      makeElement("p", "", "এলাকা: " + request.area)
    );

    // The API does not publicly return phone numbers.
    if (request.phone) {
      meta.append(
        makeElement("p", "", "যোগাযোগ: " + request.phone)
      );
    } else {
      meta.append(
        makeElement(
          "p",
          "",
          "যোগাযোগের নম্বর এখানে প্রকাশ করা হয়নি।"
        )
      );
    }

    if (request.bloodGroup) {
      meta.append(
        makeElement(
          "p",
          "",
          "রক্তের গ্রুপ: " + request.bloodGroup
        )
      );
    }

    if (request.units) {
      meta.append(
        makeElement("p", "", "পরিমাণ: " + request.units)
      );
    }

    const actions = makeElement("div", "request-actions");

    // Only show the call button when a phone number is available.
    if (request.phone) {
      const callLink = makeElement(
        "a",
        "btn btn-outline",
        "ফোন করুন"
      );

      callLink.href =
        "tel:" + request.phone.replace(/[^\d+]/g, "");

      callLink.setAttribute(
        "aria-label",
        request.title + " বিষয়ে ফোন করুন"
      );

      actions.append(callLink);
    }

    const shareLink = makeElement(
      "a",
      "btn btn-primary",
      "WhatsApp-এ শেয়ার"
    );

    const shareText = [
      "BIPOD BONDHU — সাহায্যের অনুরোধ",
      "ধরন: " + request.type,
      "শিরোনাম: " + request.title,
      "বিস্তারিত: " + request.details,
      "এলাকা: " + request.area,
      request.bloodGroup
        ? "রক্তের গ্রুপ: " + request.bloodGroup
        : "",
      request.units ? "পরিমাণ: " + request.units : "",
      request.phone ? "যোগাযোগ: " + request.phone : "",
      "",
      "অনুগ্রহ করে তথ্য যাচাই করে যোগাযোগ করুন।"
    ].filter(Boolean).join("\n");

    shareLink.href =
      "https://wa.me/?text=" + encodeURIComponent(shareText);

    shareLink.target = "_blank";
    shareLink.rel = "noopener noreferrer";

    actions.append(shareLink);
    card.append(tag, title, details, meta, actions);

    if (addToTop) {
      requestList.prepend(card);
    } else {
      requestList.append(card);
    }
  }

  // Load saved requests from D1 through the API
  async function loadRequests() {
    showEmptyState("সাহায্যের পোস্ট লোড হচ্ছে...");

    try {
      const response = await fetch(API_URL, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        cache: "no-store"
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error("পোস্ট লোড করা যায়নি।");
      }

      requestList.replaceChildren();

      if (
        !Array.isArray(result.requests) ||
        result.requests.length === 0
      ) {
        showEmptyState(
          "এখনো কোনো সাহায্যের পোস্ট নেই। প্রয়োজন হলে প্রথম পোস্টটি তৈরি করুন।"
        );
        return;
      }

      result.requests.forEach((request) => {
        renderRequest(request, false);
      });
    } catch (error) {
      console.error("Load requests error:", error);

      showEmptyState(
        "পোস্ট লোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার পেজটি রিফ্রেশ করুন।"
      );
    }
  }

  // Submit a help request to the API and save it in D1
  helpForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!helpForm.reportValidity()) {
      return;
    }

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

    if (
      !request.title ||
      !request.details ||
      !request.area ||
      !request.phone
    ) {
      showMessage(
        "helpMessage",
        "সব প্রয়োজনীয় তথ্য পূরণ করুন।",
        true
      );
      return;
    }

    const submitButton = helpForm.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    const originalButtonText = submitButton
      ? (submitButton.tagName === "INPUT"
          ? submitButton.value
          : submitButton.textContent)
      : "";

    if (submitButton) {
      submitButton.disabled = true;

      if (submitButton.tagName === "INPUT") {
        submitButton.value = "পোস্ট সংরক্ষণ হচ্ছে...";
      } else {
        submitButton.textContent = "পোস্ট সংরক্ষণ হচ্ছে...";
      }
    }

    showMessage("helpMessage", "পোস্ট সংরক্ষণ হচ্ছে...");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          type: request.type,
          title: request.title,
          details: request.details,
          area: request.area,
          phone: request.phone,
          bloodGroup: request.bloodGroup,
          units: request.units
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "পোস্ট সংরক্ষণ করা যায়নি।"
        );
      }

      helpForm.reset();
      updateBloodFields();

      showMessage(
        "helpMessage",
        "সাহায্যের পোস্ট সফলভাবে সংরক্ষিত হয়েছে।"
      );

      // Reload the saved list from the database.
      await loadRequests();

      document.getElementById("requests").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } catch (error) {
      console.error("Submit request error:", error);

      showMessage(
        "helpMessage",
        error.message === "Failed to fetch"
          ? "সার্ভারের সঙ্গে সংযোগ করা যায়নি। API URL ও CORS সেটিং পরীক্ষা করুন।"
          : (error.message || "পোস্ট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"),
        true
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;

        if (submitButton.tagName === "INPUT") {
          submitButton.value = originalButtonText;
        } else {
          submitButton.textContent = originalButtonText;
        }
      }
    }
  });

  // Donor and volunteer forms remain demo-only.
  // They do not save personal information.
  function setupDemoRegistration(form, messageId, label) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.reportValidity()) {
        return;
      }

      showMessage(
        messageId,
        label +
          " ফর্মটি সঠিকভাবে পূরণ হয়েছে। এটি ডেমো সংস্করণ—আপনার তথ্য সংরক্ষিত বা নিবন্ধিত হয়নি।"
      );

      form.reset();
    });
  }

  setupDemoRegistration(
    donorForm,
    "donorMessage",
    "রক্তদাতা নিবন্ধন"
  );

  setupDemoRegistration(
    volunteerForm,
    "volunteerMessage",
    "ভলান্টিয়ার নিবন্ধন"
  );

  // Load database records when the page opens.
  loadRequests();
});
