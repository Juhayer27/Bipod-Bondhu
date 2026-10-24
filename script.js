"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");
  const helpType = document.getElementById("helpType");
  const bloodFields = document.getElementById("bloodFields");
  const helpForm = document.getElementById("helpForm");
  const donorForm = document.getElementById("donorForm");
  const volunteerForm = document.getElementById("volunteerForm");
  const requestList = document.getElementById("requestList");

  // এই ডেমোতে পোস্ট শুধু বর্তমান পেজ খোলা থাকা পর্যন্ত থাকবে।
  const requests = [];

  document.getElementById("year").textContent =
    new Date().getFullYear();

  // মোবাইল নেভিগেশন মেনু।
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

  // রক্তের গ্রুপের ফিল্ড শুধু রক্তদানের পোস্টে দেখানো হবে।
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

  // ফর্মের অবস্থা দেখানোর জন্য।
  function showMessage(elementId, message, isError = false) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  // ব্যবহারকারীর ইনপুট নিরাপদভাবে টেক্সট হিসেবে দেখানো।
  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  // খালি পোস্টের বার্তা সরানো।
  function clearEmptyState() {
    const emptyState = requestList.querySelector(".empty-state");

    if (emptyState) {
      emptyState.remove();
    }
  }

  // নতুন পোস্টের কার্ড তৈরি।
  function renderRequest(request) {
    clearEmptyState();

    const card = makeElement("article", "request-card");
    const tag = makeElement("span", "request-tag", request.type);
    const title = makeElement("h3", "", request.title);
    const details = makeElement("p", "", request.details);
    const meta = makeElement("div", "request-meta");

    meta.append(
      makeElement("p", "", "এলাকা: " + request.area),
      makeElement("p", "", "যোগাযোগ: " + request.phone)
    );

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

    // ফোন কলের লিংক।
    const callLink = makeElement("a", "btn btn-outline", "ফোন করুন");
    callLink.href = "tel:" + request.phone.replace(/[^\d+]/g, "");
    callLink.setAttribute("aria-label", request.title + " বিষয়ে ফোন করুন");

    // WhatsApp শেয়ার লিংক।
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
      "যোগাযোগ: " + request.phone,
      "",
      "অনুগ্রহ করে তথ্য যাচাই করে যোগাযোগ করুন।"
    ].filter(Boolean).join("\n");

    shareLink.href =
      "https://wa.me/?text=" + encodeURIComponent(shareText);

    shareLink.target = "_blank";
    shareLink.rel = "noopener noreferrer";

    actions.append(callLink, shareLink);
    card.append(tag, title, details, meta, actions);
    requestList.prepend(card);
  }

  // সাহায্যের পোস্ট তৈরি।
  helpForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!helpForm.reportValidity()) {
      return;
    }

    const formData = new FormData(helpForm);

    const request = {
      type: String(formData.get("helpType") || ""),
      title: String(formData.get("helpTitle") || "").trim(),
      details: String(formData.get("helpDetails") || "").trim(),
      area: String(formData.get("helpArea") || "").trim(),
      phone: String(formData.get("helpContact") || "").trim(),
      bloodGroup: String(formData.get("bloodGroup") || ""),
      units: String(formData.get("units") || "")
    };

    if (!request.title || !request.details ||
        !request.area || !request.phone) {
      showMessage(
        "helpMessage",
        "সব প্রয়োজনীয় তথ্য পূরণ করুন।",
        true
      );
      return;
    }

    requests.unshift(request);
    renderRequest(request);

    showMessage(
      "helpMessage",
      "ডেমো পোস্ট তৈরি হয়েছে। এটি শুধু এই পেজে দেখা যাবে; সার্ভারে সংরক্ষিত হয়নি।"
    );

    helpForm.reset();
    updateBloodFields();

    document.getElementById("requests").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  // নিবন্ধন ফর্ম এখন শুধু ডেমো।
  // কোনো নাম, ফোন নম্বর বা অন্য তথ্য সংরক্ষণ করা হয় না।
  function setupDemoRegistration(form, messageId, label) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.reportValidity()) {
        return;
      }

      showMessage(
        messageId,
        label + " ফর্মটি সঠিকভাবে পূরণ হয়েছে। এটি ডেমো সংস্করণ—আপনার তথ্য সংরক্ষিত বা নিবন্ধিত হয়নি।"
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
});
