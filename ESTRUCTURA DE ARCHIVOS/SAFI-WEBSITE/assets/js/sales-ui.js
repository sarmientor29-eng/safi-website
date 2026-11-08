(function () {
  const storageKey = "safiSalesPrefill";
  const pathname = window.location.pathname.split("/").pop() || "index.html";
  const isPublicPage = ["index.html", "services.html", "contact.html"].includes(pathname);

  if (!isPublicPage) return;

  const assistantOptions = [
    {
      label: "Get a quote",
      description: "For buyers who already know the service or scope.",
      prefill: {
        intent: "quote-request",
        projectStage: "bidding",
        timeline: "within-2-weeks",
        urgency: "planned",
        preferredContact: "email",
        supportTopic: "pricing-request",
        clientStatus: "new-prospect",
        source: "assistant-entry",
        summary: "Buyer wants pricing, availability and next steps."
      }
    },
    {
      label: "Need labour fast",
      description: "For active jobs that need urgent manpower support.",
      prefill: {
        intent: "fast-staffing",
        service: "Labour Support",
        projectStage: "active-site",
        timeline: "asap",
        urgency: "urgent",
        preferredContact: "phone",
        supportTopic: "urgent-crew-support",
        clientStatus: "new-prospect",
        source: "assistant-entry",
        summary: "Urgent labour request for an active or blocked site."
      }
    },
    {
      label: "Current client support",
      description: "For existing SAFI clients that need project or portal help.",
      prefill: {
        intent: "client-support",
        service: "Existing Project Support",
        preferredContact: "email",
        supportTopic: "existing-project-support",
        clientStatus: "existing-client",
        source: "assistant-entry",
        summary: "Existing client needs support, follow-up or documentation help."
      }
    },
    {
      label: "General question",
      description: "For service guidance, general questions or first conversations.",
      prefill: {
        intent: "general-inquiry",
        service: "General Inquiry",
        preferredContact: "email",
        supportTopic: "general-question",
        clientStatus: "general-inquiry",
        source: "assistant-entry",
        summary: "General inquiry that still needs routing."
      }
    },
    {
      label: "Work with SAFI",
      description: "For workers or applicants who should go to the hiring route.",
      href: "apply.html"
    }
  ];

  function humanize(value) {
    return String(value || "").replace(/-/g, " ");
  }

  function savePrefill(prefill) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(prefill));
    } catch (err) {
      console.error("SALES PREFILL SAVE ERROR:", err);
    }
  }

  function readPrefill() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = {};

    [
      "intent",
      "service",
      "projectType",
      "projectStage",
      "timeline",
      "urgency",
      "preferredContact",
      "budgetRange",
      "source",
      "summary",
      "contactRole",
      "clientStatus",
      "supportTopic",
      "crewSize",
      "referralSource"
    ].forEach((key) => {
      const value = params.get(key);
      if (value) fromUrl[key] = value;
    });

    let fromStorage = {};
    try {
      const raw = sessionStorage.getItem(storageKey);
      fromStorage = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error("SALES PREFILL READ ERROR:", err);
    }

    return { ...fromStorage, ...fromUrl };
  }

  function buildContactUrl(prefill) {
    const params = new URLSearchParams();
    Object.entries(prefill).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `contact.html?${params.toString()}`;
  }

  function openAssistantOption(option) {
    if (option.href) {
      window.location.href = option.href;
      return;
    }

    savePrefill(option.prefill);
    if (pathname === "contact.html") {
      applyPrefill(option.prefill);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.location.href = buildContactUrl(option.prefill);
  }

  function createAssistant() {
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "sales-assistant-fab";
    fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = `
      <span class="sales-assistant-icon">AI</span>
      <span>
        <strong>Sales assistant</strong>
        <span>Start with the right lead path</span>
      </span>
    `;

    const panel = document.createElement("div");
    panel.className = "sales-assistant-panel";
    panel.innerHTML = `
      <div class="sales-assistant-header">
        <div>
          <h3>Assistant entry point</h3>
          <p>This is a frontend-ready sales layer you can later connect to OpenAI or Next.js.</p>
        </div>
        <button class="sales-assistant-close" type="button" aria-label="Close assistant">&times;</button>
      </div>
      <p class="sales-assistant-note">
        The assistant now helps classify new business, urgent staffing, support and hiring paths before any backend automation exists.
      </p>
      <div class="sales-assistant-options">
        ${assistantOptions.map((option, index) => `
          <div class="sales-assistant-option">
            <strong>${option.label}</strong>
            <span>${option.description}</span>
            <button type="button" data-assistant-option="${index}">${option.href ? "Go there" : "Continue"}</button>
          </div>
        `).join("")}
      </div>
    `;

    function setOpen(isOpen) {
      panel.classList.toggle("is-open", isOpen);
      fab.setAttribute("aria-expanded", String(isOpen));
    }

    fab.addEventListener("click", () => {
      setOpen(!panel.classList.contains("is-open"));
    });

    panel.querySelector(".sales-assistant-close").addEventListener("click", () => {
      setOpen(false);
    });

    panel.querySelectorAll("[data-assistant-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const option = assistantOptions[Number(button.dataset.assistantOption)];
        setOpen(false);
        openAssistantOption(option);
      });
    });

    document.addEventListener("click", (event) => {
      if (!panel.classList.contains("is-open")) return;
      if (panel.contains(event.target) || fab.contains(event.target)) return;
      setOpen(false);
    });

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    document.querySelectorAll("[data-open-sales-assistant]").forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        setOpen(true);
      });
    });
  }

  function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (!field || typeof value === "undefined" || value === null) return;
    field.value = value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getIntentButtonMatch(intent, buttonIntent) {
    if (intent === buttonIntent) return true;
    if (intent === "sales-conversation" && buttonIntent === "sales-conversation") return true;
    return false;
  }

  function setIntentSelection(intent) {
    document.querySelectorAll("[data-intent-button]").forEach((button) => {
      button.classList.toggle("is-active", getIntentButtonMatch(intent, button.dataset.intentButton));
    });
  }

  function setServiceSelection(service) {
    document.querySelectorAll("[data-service-button]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.serviceButton === service);
    });
  }

  function buildSummary(payload) {
    const parts = [];
    if (payload.intent) parts.push(`Intent: ${humanize(payload.intent)}`);
    if (payload.service) parts.push(`Need: ${payload.service}`);
    if (payload.supportTopic) parts.push(`Topic: ${humanize(payload.supportTopic)}`);
    if (payload.timeline) parts.push(`Timeline: ${humanize(payload.timeline)}`);
    if (payload.urgency) parts.push(`Urgency: ${humanize(payload.urgency)}`);
    return parts.join(" | ");
  }

  function getContactPayload() {
    return {
      intent: document.getElementById("lead-intent")?.value || "",
      service: document.getElementById("service-interest")?.value || "",
      projectType: document.getElementById("project-type")?.value || "",
      projectStage: document.getElementById("project-stage")?.value || "",
      timeline: document.getElementById("timeline")?.value || "",
      urgency: document.getElementById("urgency")?.value || "",
      preferredContact: document.getElementById("preferred-contact")?.value || "",
      budgetRange: document.getElementById("budget-range")?.value || "",
      supportTopic: document.getElementById("support-topic")?.value || "",
      crewSize: document.getElementById("crew-size")?.value || "",
      contactRole: document.getElementById("contact-role")?.value || "",
      clientStatus: document.getElementById("client-status")?.value || "",
      referralSource: document.getElementById("referral-source")?.value || "",
      location: document.getElementById("client-location")?.value.trim() || "",
      scope: document.getElementById("client-scope")?.value.trim() || "",
      company: document.getElementById("client-company")?.value.trim() || ""
    };
  }

  function getIntentPreset(intent) {
    const presets = {
      "quote-request": {
        clientStatus: "new-prospect",
        supportTopic: "pricing-request",
        preferredContact: "email"
      },
      "fast-staffing": {
        service: "Labour Support",
        projectStage: "active-site",
        timeline: "asap",
        urgency: "urgent",
        preferredContact: "phone",
        supportTopic: "urgent-crew-support",
        clientStatus: "new-prospect"
      },
      "sales-conversation": {
        supportTopic: "service-guidance",
        clientStatus: "new-prospect",
        preferredContact: "call"
      },
      "client-support": {
        service: "Existing Project Support",
        supportTopic: "existing-project-support",
        clientStatus: "existing-client",
        preferredContact: "email",
        projectStage: "active-site"
      },
      "general-inquiry": {
        service: "General Inquiry",
        supportTopic: "general-question",
        clientStatus: "general-inquiry",
        preferredContact: "email"
      },
      "worker-application": {
        service: "Hiring / Work Inquiry",
        supportTopic: "hiring-work-inquiry",
        clientStatus: "worker-applicant",
        contactRole: "worker-applicant",
        preferredContact: "email"
      }
    };

    return presets[intent] || {};
  }

  function inferIntent(payload) {
    if (payload.intent) return payload.intent;
    if (payload.clientStatus === "worker-applicant" || payload.supportTopic === "hiring-work-inquiry" || payload.service === "Hiring / Work Inquiry") {
      return "worker-application";
    }
    if (payload.clientStatus === "existing-client" || payload.supportTopic === "existing-project-support" || payload.service === "Existing Project Support") {
      return "client-support";
    }
    if (payload.supportTopic === "urgent-crew-support" || payload.service === "Labour Support") {
      return "fast-staffing";
    }
    if (payload.supportTopic === "pricing-request") {
      return "quote-request";
    }
    if (payload.supportTopic === "service-guidance") {
      return "sales-conversation";
    }
    if (payload.clientStatus === "general-inquiry" || payload.service === "General Inquiry") {
      return "general-inquiry";
    }
    return "";
  }

  function evaluateLead(rawPayload) {
    const payload = { ...rawPayload, intent: inferIntent(rawPayload) };
    const ready = [];
    const missing = [];
    let score = 0;

    if (payload.intent) {
      ready.push(`Intent captured: ${humanize(payload.intent)}`);
      score += 14;
    } else {
      missing.push("Choose the right intake path before sending the message.");
    }

    if (payload.service) {
      ready.push(`Primary need selected: ${payload.service}`);
      score += 12;
    } else {
      missing.push("Select the main need so the lead can be routed properly.");
    }

    if (payload.clientStatus) {
      ready.push(`Relationship identified: ${humanize(payload.clientStatus)}`);
      score += 10;
    } else {
      missing.push("Choose whether this is a new prospect, current client, worker or general inquiry.");
    }

    if (payload.contactRole) {
      ready.push(`Role captured: ${humanize(payload.contactRole)}`);
      score += 6;
    }

    if (payload.location) {
      ready.push(`Location added: ${payload.location}`);
      score += 10;
    } else {
      missing.push("Add a site or business location for better routing.");
    }

    if (payload.timeline) {
      ready.push(`Timeline captured: ${humanize(payload.timeline)}`);
      score += 8;
    } else if (!["worker-application", "general-inquiry"].includes(payload.intent)) {
      missing.push("Set a timeline to separate urgent requests from planning-stage leads.");
    }

    if (payload.urgency) {
      ready.push(`Urgency noted: ${humanize(payload.urgency)}`);
      score += 6;
    }

    if (payload.supportTopic) {
      ready.push(`Topic captured: ${humanize(payload.supportTopic)}`);
      score += 8;
    }

    if (payload.preferredContact) {
      ready.push(`Preferred contact: ${humanize(payload.preferredContact)}`);
      score += 5;
    }

    if (payload.projectType) {
      ready.push(`Project type: ${humanize(payload.projectType)}`);
      score += 4;
    }

    if (payload.projectStage) {
      ready.push(`Project stage: ${humanize(payload.projectStage)}`);
      score += 4;
    }

    if (payload.crewSize) {
      ready.push(`Crew size hint: ${humanize(payload.crewSize)}`);
      score += 4;
    }

    if (payload.budgetRange) {
      ready.push(`Budget range shared: ${humanize(payload.budgetRange)}`);
      score += 4;
    }

    if (payload.referralSource) {
      ready.push(`Referral source captured: ${humanize(payload.referralSource)}`);
      score += 3;
    }

    if (payload.company) {
      ready.push(`Company included: ${payload.company}`);
      score += 3;
    }

    if (payload.scope.length >= 60) {
      ready.push("Detailed context provided for handoff.");
      score += 13;
    } else if (payload.scope.length >= 20) {
      ready.push("Useful intake summary provided.");
      score += 7;
      missing.push("Add more detail to improve routing accuracy and quote quality.");
    } else {
      missing.push("Add more detail to explain the project, support issue or inquiry.");
    }

    score = Math.min(100, score);

    let segment = "Unclassified";
    let route = "sales-discovery";
    let routeLabel = "Discovery lead";
    let recommendation = "Complete the intake with more context so SAFI can route it correctly.";
    let automationNote = "This intake is collecting context that can later be scored by AI or passed to an analyst workflow.";
    let journeyStage = "Discovery";
    let analystBucket = "general-triage";
    let recommendedDestination = "Stay on intelligent intake";
    let responsePriority = "Normal";
    let destinationHref = "#contact-form";
    let destinationLabel = "Complete intake below";
    let secondaryHref = "services.html";
    let secondaryLabel = "Review services";

    switch (payload.intent) {
      case "worker-application":
        segment = "Worker applicant";
        route = "talent-route";
        routeLabel = "Talent route";
        recommendation = "Direct this contact to the apply page unless there is a special hiring support question.";
        automationNote = "This route is ready to separate hiring traffic from commercial leads in a future analyst layer.";
        journeyStage = "Talent screening";
        analystBucket = "talent-acquisition";
        recommendedDestination = "Apply page";
        responsePriority = "Normal";
        destinationHref = "apply.html";
        destinationLabel = "Go to apply page";
        secondaryHref = "#contact-form";
        secondaryLabel = "Keep hiring inquiry here";
        break;
      case "client-support":
        segment = "Existing client";
        route = "client-support";
        routeLabel = "Client support intake";
        recommendation = "Route to client support and suggest portal login when operational access is needed.";
        automationNote = "This intake can later separate support traffic from new sales leads automatically.";
        journeyStage = "Support handoff";
        analystBucket = "client-success";
        recommendedDestination = "Portal login or support review";
        responsePriority = payload.urgency === "urgent" ? "High" : "Normal";
        destinationHref = "login.html";
        destinationLabel = "Portal login";
        secondaryHref = "#contact-form";
        secondaryLabel = "Keep support request here";
        break;
      case "fast-staffing":
        segment = "Crew buyer";
        route = "rapid-response";
        routeLabel = "Rapid staffing lead";
        recommendation = "Prioritize quick follow-up and crew availability review for this job.";
        automationNote = "This request is structured for future urgent staffing routing and faster triage.";
        journeyStage = "Rapid staffing";
        analystBucket = "urgent-staffing";
        recommendedDestination = "Urgent staffing review";
        responsePriority = "High";
        destinationHref = "#contact-form";
        destinationLabel = "Complete urgent intake below";
        secondaryHref = "services.html";
        secondaryLabel = "Review crew services";
        break;
      case "quote-request":
        segment = "Potential client";
        route = payload.service && payload.location && payload.scope.length >= 20 ? "quote-review" : "sales-qualified";
        routeLabel = route === "quote-review" ? "Quote-ready lead" : "Qualified sales lead";
        recommendation = route === "quote-review"
          ? "Route this request into quote review with service, scope and location already captured."
          : "Qualify the lead, then confirm quote details before pricing.";
        automationNote = "This intake is structured so future AI can assist with quote prep and lead scoring.";
        journeyStage = route === "quote-review" ? "Quote review" : "Qualification";
        analystBucket = "new-business";
        recommendedDestination = route === "quote-review" ? "Quote review queue" : "Sales qualification";
        responsePriority = score >= 70 ? "High" : "Normal";
        destinationHref = "#contact-form";
        destinationLabel = route === "quote-review" ? "Complete quote intake below" : "Add more quote detail";
        secondaryHref = "services.html";
        secondaryLabel = "Review services";
        break;
      case "sales-conversation":
        segment = "Potential client";
        route = "guided-sales";
        routeLabel = "Sales guidance lead";
        recommendation = "Route to a short sales conversation before quote creation.";
        automationNote = "This path is useful for future AI-guided qualification before pricing.";
        journeyStage = "Guided qualification";
        analystBucket = "sales-discovery";
        recommendedDestination = "Sales conversation";
        responsePriority = "Normal";
        destinationHref = "#contact-form";
        destinationLabel = "Complete guidance intake";
        secondaryHref = "services.html";
        secondaryLabel = "Review services";
        break;
      case "general-inquiry":
        segment = "General inquiry";
        route = "general-triage";
        routeLabel = "General inquiry";
        recommendation = "Route this message through general triage before deciding whether it belongs in sales, support or another path.";
        automationNote = "General inquiries are now tagged separately so future analytics do not contaminate sales quality reporting.";
        journeyStage = "General triage";
        analystBucket = "general-inquiry";
        recommendedDestination = "General triage";
        responsePriority = "Normal";
        destinationHref = "#contact-form";
        destinationLabel = "Send general inquiry below";
        secondaryHref = "services.html";
        secondaryLabel = "Review services";
        break;
      default:
        segment = payload.clientStatus ? humanize(payload.clientStatus) : "Unclassified";
        break;
    }

    let temperature = "discovery";
    if (responsePriority === "High" || score >= 78) {
      temperature = "hot";
    } else if (route !== "sales-discovery" || score >= 46) {
      temperature = "warm";
    }

    return {
      payload,
      score,
      temperature,
      segment,
      route,
      routeLabel,
      recommendation,
      automationNote,
      journeyStage,
      analystBucket,
      recommendedDestination,
      responsePriority,
      destinationHref,
      destinationLabel,
      secondaryHref,
      secondaryLabel,
      ready: ready.slice(0, 6),
      missing: missing.slice(0, 6)
    };
  }

  function renderLeadSummary() {
    const summaryWrap = document.getElementById("lead-summary");
    const summaryText = document.getElementById("lead-summary-text");
    if (!summaryWrap || !summaryText) return;

    const evaluation = evaluateLead(getContactPayload());
    const payload = evaluation.payload;
    const summary = buildSummary(payload);
    summaryWrap.innerHTML = "";

    if (!summary) {
      summaryText.textContent = "Choose an intake path or use the assistant so SAFI can classify the lead before submission.";
      summaryWrap.innerHTML = `<span class="lead-summary-pill is-muted">No lead profile selected yet</span>`;
      return;
    }

    summaryText.textContent = "This intake summary is built in the frontend so it can later feed OpenAI, CRM automation, analyst scoring or a Next.js sales workflow.";

    [
      evaluation.segment && `Segment: ${evaluation.segment}`,
      payload.intent && `Intent: ${humanize(payload.intent)}`,
      payload.service && `Need: ${payload.service}`,
      payload.supportTopic && `Topic: ${humanize(payload.supportTopic)}`,
      payload.timeline && `Timeline: ${humanize(payload.timeline)}`,
      payload.urgency && `Urgency: ${humanize(payload.urgency)}`
    ].filter(Boolean).forEach((value) => {
      const pill = document.createElement("span");
      pill.className = "lead-summary-pill";
      pill.textContent = value;
      summaryWrap.appendChild(pill);
    });
  }

  function renderLeadRouting() {
    const routeBadge = document.getElementById("lead-route-badge");
    const routeCopy = document.getElementById("lead-route-copy");
    const scoreLabel = document.getElementById("lead-score-label");
    const scoreFill = document.getElementById("lead-score-fill");
    const readyList = document.getElementById("lead-ready-list");
    const missingList = document.getElementById("lead-missing-list");
    const automationNote = document.getElementById("lead-automation-note");
    const routeLink = document.getElementById("lead-route-link");
    const secondaryLink = document.getElementById("lead-secondary-link");
    const leadSegmentLabel = document.getElementById("lead-segment-label");
    const journeyStageLabel = document.getElementById("journey-stage-label");
    const recommendedDestinationLabel = document.getElementById("recommended-destination-label");
    const responsePriorityLabel = document.getElementById("response-priority-label");

    if (
      !routeBadge || !routeCopy || !scoreLabel || !scoreFill || !readyList || !missingList ||
      !automationNote || !routeLink || !secondaryLink || !leadSegmentLabel ||
      !journeyStageLabel || !recommendedDestinationLabel || !responsePriorityLabel
    ) {
      return;
    }

    const evaluation = evaluateLead(getContactPayload());

    routeBadge.className = `sales-route-badge is-${evaluation.temperature}`;
    routeBadge.textContent = evaluation.routeLabel;
    routeCopy.textContent = evaluation.recommendation;
    scoreLabel.textContent = `${evaluation.score} / 100`;
    scoreFill.className = `sales-score-fill is-${evaluation.temperature}`;
    scoreFill.style.width = `${evaluation.score}%`;
    automationNote.textContent = evaluation.automationNote;

    routeLink.href = evaluation.destinationHref;
    routeLink.textContent = evaluation.destinationLabel;
    secondaryLink.href = evaluation.secondaryHref;
    secondaryLink.textContent = evaluation.secondaryLabel;

    leadSegmentLabel.textContent = evaluation.segment;
    journeyStageLabel.textContent = evaluation.journeyStage;
    recommendedDestinationLabel.textContent = evaluation.recommendedDestination;
    responsePriorityLabel.textContent = evaluation.responsePriority;

    readyList.innerHTML = evaluation.ready.length
      ? evaluation.ready.map((item) => `<li>${item}</li>`).join("")
      : `<li class="is-missing">Start with an intake path, service or support topic to build the lead profile.</li>`;

    missingList.innerHTML = evaluation.missing.length
      ? evaluation.missing.map((item) => `<li class="is-missing">${item}</li>`).join("")
      : `<li>Lead has enough structure for the next operational step.</li>`;
  }

  function updateSubjectAndHidden() {
    const subjectField = document.querySelector('input[name="_subject"]');
    const assistantSummaryField = document.getElementById("assistant-summary");
    const leadSourceField = document.getElementById("lead-source");
    const pageContextField = document.getElementById("page-context");
    const leadTemperatureField = document.getElementById("lead-temperature");
    const recommendedActionField = document.getElementById("recommended-action");
    const automationRouteField = document.getElementById("automation-route");
    const leadScoreField = document.getElementById("lead-score");
    const leadSegmentField = document.getElementById("lead-segment");
    const journeyStageField = document.getElementById("journey-stage");
    const analystBucketField = document.getElementById("analyst-bucket");
    const recommendedDestinationField = document.getElementById("recommended-destination");
    const responsePriorityField = document.getElementById("response-priority");

    const evaluation = evaluateLead(getContactPayload());
    const payload = evaluation.payload;
    const summary = buildSummary(payload);

    if (subjectField) {
      const subjectBits = ["New SAFI intake"];
      if (evaluation.segment) subjectBits.push(evaluation.segment);
      if (payload.intent) subjectBits.push(humanize(payload.intent));
      if (payload.service) subjectBits.push(payload.service);
      subjectField.value = subjectBits.join(" • ");
    }

    if (assistantSummaryField) {
      assistantSummaryField.value = [
        summary,
        `Segment: ${evaluation.segment}`,
        `Route: ${evaluation.routeLabel}`,
        `Stage: ${evaluation.journeyStage}`,
        `Recommendation: ${evaluation.recommendation}`
      ].filter(Boolean).join(" | ");
    }

    if (leadSourceField && !leadSourceField.value) {
      leadSourceField.value = pathname === "contact.html" ? "contact-page" : "website";
    }

    if (pageContextField) {
      pageContextField.value = pathname;
    }

    if (leadTemperatureField) {
      leadTemperatureField.value = evaluation.temperature;
    }

    if (recommendedActionField) {
      recommendedActionField.value = evaluation.recommendation;
    }

    if (automationRouteField) {
      automationRouteField.value = evaluation.route;
    }

    if (leadScoreField) {
      leadScoreField.value = String(evaluation.score);
    }

    if (leadSegmentField) {
      leadSegmentField.value = evaluation.segment;
    }

    if (journeyStageField) {
      journeyStageField.value = evaluation.journeyStage;
    }

    if (analystBucketField) {
      analystBucketField.value = evaluation.analystBucket;
    }

    if (recommendedDestinationField) {
      recommendedDestinationField.value = evaluation.recommendedDestination;
    }

    if (responsePriorityField) {
      responsePriorityField.value = evaluation.responsePriority;
    }
  }

  function applyIntentPreset(intent) {
    const preset = getIntentPreset(intent);
    Object.entries(preset).forEach(([key, value]) => {
      const map = {
        service: "service-interest",
        projectStage: "project-stage",
        timeline: "timeline",
        urgency: "urgency",
        preferredContact: "preferred-contact",
        supportTopic: "support-topic",
        clientStatus: "client-status",
        contactRole: "contact-role"
      };
      if (map[key]) setFieldValue(map[key], value);
    });

    if (preset.service) setServiceSelection(preset.service);
  }

  function applyPrefill(prefill) {
    if (pathname !== "contact.html") return;

    if (prefill.intent) {
      setFieldValue("lead-intent", prefill.intent);
      setIntentSelection(prefill.intent);
      applyIntentPreset(prefill.intent);
    }
    if (prefill.service) {
      setFieldValue("service-interest", prefill.service);
      setServiceSelection(prefill.service);
    }
    if (prefill.projectType) setFieldValue("project-type", prefill.projectType);
    if (prefill.projectStage) setFieldValue("project-stage", prefill.projectStage);
    if (prefill.timeline) setFieldValue("timeline", prefill.timeline);
    if (prefill.urgency) setFieldValue("urgency", prefill.urgency);
    if (prefill.preferredContact) setFieldValue("preferred-contact", prefill.preferredContact);
    if (prefill.budgetRange) setFieldValue("budget-range", prefill.budgetRange);
    if (prefill.supportTopic) setFieldValue("support-topic", prefill.supportTopic);
    if (prefill.crewSize) setFieldValue("crew-size", prefill.crewSize);
    if (prefill.contactRole) setFieldValue("contact-role", prefill.contactRole);
    if (prefill.clientStatus) setFieldValue("client-status", prefill.clientStatus);
    if (prefill.referralSource) setFieldValue("referral-source", prefill.referralSource);
    if (prefill.source) setFieldValue("lead-source", prefill.source);
    if (prefill.summary) setFieldValue("assistant-summary", prefill.summary);

    const scopeField = document.getElementById("client-scope");
    const payloadIntent = prefill.intent || "";

    if (scopeField && !scopeField.value.trim()) {
      if (prefill.service && payloadIntent === "quote-request") {
        scopeField.value = `Interested in ${prefill.service}. Please share availability, next steps and quote guidance.`;
      } else if (payloadIntent === "fast-staffing") {
        scopeField.value = "We need crew support quickly. Please advise availability, manpower options and next steps.";
      } else if (payloadIntent === "client-support") {
        scopeField.value = "I am a current SAFI client and need support with an active or recent project.";
      } else if (payloadIntent === "general-inquiry") {
        scopeField.value = "I have a general question and would like guidance on the next best step.";
      } else if (payloadIntent === "worker-application") {
        scopeField.value = "I would like information related to working with SAFI or hiring support.";
      } else if (payloadIntent === "sales-conversation") {
        scopeField.value = "I need help understanding the right service mix, scope or next step before pricing.";
      }
    }

    updateSubjectAndHidden();
    renderLeadSummary();
    renderLeadRouting();
  }

  function initContactFormEnhancements() {
    if (pathname !== "contact.html") return;

    const prefill = readPrefill();
    if (Object.keys(prefill).length) {
      applyPrefill(prefill);
    } else {
      renderLeadSummary();
      renderLeadRouting();
      updateSubjectAndHidden();
    }

    document.querySelectorAll("[data-intent-button]").forEach((button) => {
      button.addEventListener("click", () => {
        const intent = button.dataset.intentButton;
        setFieldValue("lead-intent", intent);
        setIntentSelection(intent);
        applyIntentPreset(intent);
        updateSubjectAndHidden();
        renderLeadSummary();
        renderLeadRouting();
      });
    });

    document.querySelectorAll("[data-service-button]").forEach((button) => {
      button.addEventListener("click", () => {
        const service = button.dataset.serviceButton;
        setFieldValue("service-interest", service);
        setServiceSelection(service);

        if (service === "Labour Support" && !document.getElementById("lead-intent")?.value) {
          setFieldValue("lead-intent", "fast-staffing");
          setIntentSelection("fast-staffing");
          applyIntentPreset("fast-staffing");
        } else if (service === "Existing Project Support" && !document.getElementById("lead-intent")?.value) {
          setFieldValue("lead-intent", "client-support");
          setIntentSelection("client-support");
          applyIntentPreset("client-support");
        } else if (service === "General Inquiry" && !document.getElementById("lead-intent")?.value) {
          setFieldValue("lead-intent", "general-inquiry");
          setIntentSelection("general-inquiry");
          applyIntentPreset("general-inquiry");
        }

        updateSubjectAndHidden();
        renderLeadSummary();
        renderLeadRouting();
      });
    });

    [
      "lead-intent",
      "service-interest",
      "project-type",
      "project-stage",
      "timeline",
      "urgency",
      "preferred-contact",
      "budget-range",
      "support-topic",
      "crew-size",
      "contact-role",
      "client-status",
      "referral-source"
    ].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      field.addEventListener("change", () => {
        if (id === "service-interest") {
          setServiceSelection(field.value);
        }
        updateSubjectAndHidden();
        renderLeadSummary();
        renderLeadRouting();
      });
    });

    ["client-company", "client-location", "client-scope"].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      field.addEventListener("input", () => {
        updateSubjectAndHidden();
        renderLeadSummary();
        renderLeadRouting();
      });
    });

    const form = document.getElementById("contact-form");
    if (form) {
      form.addEventListener("submit", () => {
        updateSubjectAndHidden();
        const payload = getContactPayload();
        savePrefill({
          intent: document.getElementById("lead-intent")?.value || "",
          service: payload.service,
          projectType: payload.projectType,
          projectStage: payload.projectStage,
          timeline: payload.timeline,
          urgency: payload.urgency,
          preferredContact: payload.preferredContact,
          budgetRange: payload.budgetRange,
          supportTopic: payload.supportTopic,
          crewSize: payload.crewSize,
          contactRole: payload.contactRole,
          clientStatus: payload.clientStatus,
          referralSource: payload.referralSource,
          source: document.getElementById("lead-source")?.value || "contact-page",
          summary: document.getElementById("assistant-summary")?.value || ""
        });
      });

      form.addEventListener("reset", () => {
        window.setTimeout(() => {
          setIntentSelection("");
          setServiceSelection("");
          updateSubjectAndHidden();
          renderLeadSummary();
          renderLeadRouting();
        }, 0);
      });
    }
  }

  createAssistant();
  initContactFormEnhancements();
})();
