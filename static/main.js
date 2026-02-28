// ==============================
// Global chart instances
// ==============================
let speakerChart,
  topSpeakerChart,
  companyChart,
  topCompanyChart,
  speakerLangChart,
  speakerTrackChart,
  speakerCompanyChart,
  uniqueSpeakersChart,
  companyLangChart,
  companyTrackChart,
  companySpeakerChart,
  uniqueCompaniesChart;

// langLabel
function langLabel(v) {
  if (v === 0 || v === "0") return "DE";
  if (v === 1 || v === "1") return "EN";
  return "N/A";
}
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// autocomplete fetch
async function fetchSuggestions(endpoint, q, datalistId, fieldName) {
  const listEl = document.getElementById(datalistId);
  if (!listEl) return;

  if (!q || q.length < 1) {
    listEl.innerHTML = "";
    return;
  }

  const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
  const data = await res.json();

  listEl.innerHTML = data
    .map((row) => `<option value="${row[fieldName]}"></option>`)
    .join("");
}

// ==============================
// Speaker Analysis
// ==============================
async function loadSpeakerAnalysis() {
  const name = document.getElementById("speakerName")?.value.trim();
  const year = document.getElementById("speakerYear")?.value || "";

  if (!name) {
    alert("Enter speaker name");
    return;
  }

  await Promise.all([
    loadSpeakerCount(name, year),
    loadSpeakerLang(name, year),
    loadSpeakerTracks(name, year),
    loadSpeakerSessions(name, year),
    loadSpeakerTdwiStats(name, year),
    loadSpeakerTdwiSessions(name, year),
    loadSpeakerCompaniesOverTime(name),
    updateSpeakerMetrics(name, year),
  ]);
}

// Talks per year
async function loadSpeakerCount(nameArg, yearArg) {
  const name = nameArg ?? document.getElementById("speakerName")?.value.trim();
  const year = yearArg ?? (document.getElementById("speakerYear")?.value || "");

  if (!name || !document.getElementById("speakerChart")) return;

  const res = await fetch(
    `/api/speaker_count?name=${encodeURIComponent(name)}&year=${year}`
  );
  const data = await res.json();

  const labels = data.map((d) => d.year);
  const values = data.map((d) => d.talks);

  renderBarChart(
    "speakerChart",
    labels,
    values,
    speakerChart,
    (c) => (speakerChart = c),
    `${name} – talks per year`
  );
}

// SpeakerLang
async function loadSpeakerLang(name, year) {
  if (!document.getElementById("speakerLangChart")) return;

  const params = new URLSearchParams({ name, year });
  const res = await fetch(`/api/speaker_langs?${params.toString()}`);
  const data = await res.json();

  if (!data.length) {
    if (speakerLangChart) speakerLangChart.destroy();
    return;
  }

  const labels = data.map((d) => langLabel(d.lang));
  const values = data.map((d) => d.talks);
  const total = values.reduce((a, b) => a + b, 0);

  renderPieChart(
    "speakerLangChart",
    labels,
    values,
    speakerLangChart,
    (c) => (speakerLangChart = c),
    "Language distribution",
    total
  );
}

// Track 
async function loadSpeakerTracks(name, year) {
  if (!document.getElementById("speakerTrackChart")) return;

  const params = new URLSearchParams({ name, year });
  const res = await fetch(`/api/speaker_tracks?${params.toString()}`);
  const data = await res.json();

  if (!data.length) {
    if (speakerTrackChart) speakerTrackChart.destroy();
    return;
  }

  const labels = data.map((d) => d.track);
  const values = data.map((d) => d.talks);

  renderHBarChart(
    "speakerTrackChart",
    labels,
    values,
    speakerTrackChart,
    (c) => (speakerTrackChart = c),
    "Track distribution"
  );
}

// Speaker session table
async function loadSpeakerSessions(name, year) {
  const tbody = document.getElementById("speakerSessionsBody");
  if (!tbody) return;

  const params = new URLSearchParams({ name, year });
  const res = await fetch(`/api/speaker_sessions?${params.toString()}`);
  const data = await res.json();

  tbody.innerHTML = data
    .map((r) => {
      const date = (r.date || "").split(" ")[0];
      const time = (r.start ?? "") + (r.end ? " – " + r.end : "");
      return `
        <tr>
          <td>${r.year ?? ""}</td>
          <td>${date}</td>
          <td>${time}</td>
          <td>${r.track ?? ""}</td>
          <td>${langLabel(r.lang)}</td>
          <td>${r.title ?? ""}</td>
          <td>${r.company ?? ""}</td>
        </tr>
      `;
    })
    .join("");
}
async function loadSpeakerTdwiSessions(name, year) {
  const block = document.getElementById("tdwiBlock");
  const tbody = document.getElementById("tdwiSessionsBody");
  if (!block || !tbody) return;

  const params = new URLSearchParams({ name, year });
  const res = await fetch(`/api/speaker_tdwi_sessions?${params.toString()}`);
  const data = await res.json();

  tbody.innerHTML = "";

  if (!data.length) {
    block.style.display = "none";
    return;
  }

  block.style.display = "block";

  tbody.innerHTML = data
    .map((r) => {
      const date = (r.date || "").split(" ")[0];
      const time = (r.start ?? "") + (r.end ? " – " + r.end : "");
      return `
        <tr>
          <td>${r.year ?? ""}</td>
          <td>${date}</td>
          <td>${time}</td>
          <td>${r.track ?? ""}</td>
          <td>${langLabel(r.lang)}</td>
          <td>${r.title ?? ""}</td>
          <td><span class="badge bg-secondary">${r.affiliation ?? "TDWI"}</span></td>
        </tr>
      `;
    })
    .join("");
}
async function loadSpeakerTdwiStats(name, year) {
  const block = document.getElementById("tdwiBlock");
  const totalEl = document.getElementById("tdwiTotal");
  const roleWrap = document.getElementById("tdwiRoleBadges");
  const canvas = document.getElementById("tdwiYearChart");

  if (!block || !totalEl || !roleWrap || !canvas) return;

  const params = new URLSearchParams({ name, year });
  const res = await fetch(`/api/speaker_tdwi_stats?${params.toString()}`);
  const stats = await res.json();

  const total = stats.total ?? 0;
  if (!total) {
    block.style.display = "none";
    if (tdwiYearChart) tdwiYearChart.destroy();
    roleWrap.innerHTML = "";
    return;
  }

  block.style.display = "block";
  totalEl.textContent = total;

  // role badges
  roleWrap.innerHTML = (stats.by_role || [])
    .map(r => {
      const role = r.role ?? "TDWI";
      const talks = r.talks ?? 0;
      return `<span class="badge bg-secondary me-2 mb-2">${role}: ${talks}</span>`;
    })
    .join("");

  // by-year chart (bar)
  const labels = (stats.by_year || []).map(d => d.year);
  const values = (stats.by_year || []).map(d => d.talks);

  if (tdwiYearChart) tdwiYearChart.destroy();
  tdwiYearChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "TDWI sessions",
        data: values
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}
async function loadTdwiExpertsTop() {
  const tbody = document.getElementById("tdwiExpertsBody");
  if (!tbody) return;

  const res = await fetch("/api/tdwi_experts_top?limit=3");
  const data = await res.json();

  if (!data.length) {
    tbody.innerHTML = `<tr><td class="text-muted" colspan="2">No TDWI experts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map((r) => {
      const name = r.name ?? "";
      const years = (r.years ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .sort()
        .join(", ");

      return `
        <tr>
          <td>
            <a href="javascript:void(0)" class="switch-speaker-link tdwi-speaker-link" data-name="${name}">
              ${name}
            </a>
          </td>
          <td class="text-nowrap">${years}</td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".tdwi-speaker-link").forEach((a) => {
    a.addEventListener("click", () => {
      const nm = a.getAttribute("data-name") || "";
      const input = document.getElementById("speakerName");
      if (input) input.value = nm;
      if (typeof loadSpeakerAnalysis === "function") loadSpeakerAnalysis();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}


async function loadSpeakerCompaniesOverTime(name) {
  if (!document.getElementById("speakerCompanyChart")) return;

  const params = new URLSearchParams({ name });
  const res = await fetch(`/api/speaker_companies_over_time?${params.toString()}`);
  const data = await res.json();

  if (!data.length) {
    if (speakerCompanyChart) speakerCompanyChart.destroy();
    return;
  }

  // years（x）
  const years = [...new Set(data.map((d) => d.year))].sort();

  const perYear = years.map((y) => {
    const rows = data.filter((d) => d.year === y);
    const total = rows.reduce((s, r) => s + (r.talks || 0), 0);

    rows.sort((a, b) => (b.talks || 0) - (a.talks || 0));
    const comp = rows[0]?.company || "Unknown";

    return { year: y, total, comp };
  });

  const values = perYear.map((r) => r.total);
  const comps = perYear.map((r) => r.comp);

  const palette = [
    "rgba(59,130,246,0.35)", 
    "rgba(239,68,68,0.28)",  
    "rgba(16,185,129,0.30)", 
    "rgba(245,158,11,0.30)", 
    "rgba(139,92,246,0.30)", 
    "rgba(6,182,212,0.30)",  
    "rgba(249,115,22,0.30)", 
    "rgba(34,197,94,0.30)",  
    "rgba(100,116,139,0.30)" 
  ];

  const uniqComps = [...new Set(comps)];
  const colorMap = {};
  uniqComps.forEach((c, i) => (colorMap[c] = palette[i % palette.length]));

  function rgbaWithAlpha(rgba, a) {
    return rgba.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/, `rgba($1,$2,$3,${a})`);
  }

  if (speakerCompanyChart) speakerCompanyChart.destroy();
  const ctx = document.getElementById("speakerCompanyChart");
  if (!ctx) return;

  const bgColors = comps.map((c) => colorMap[c] || "rgba(148,163,184,0.30)");
  const bdColors = bgColors.map((c) => rgbaWithAlpha(c, 0.9));

  speakerCompanyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          label: "Talks per year",
          data: values,
          backgroundColor: bgColors,
          borderColor: bdColors,
          borderWidth: 1,
          borderRadius: 10
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "center",
          fullSize: true,
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            generateLabels: () =>
              uniqComps.map((c) => ({
                text: c,
                fillStyle: colorMap[c],
                strokeStyle: rgbaWithAlpha(colorMap[c], 0.9),
                lineWidth: 2
              }))
          },
          onClick: null
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const i = context.dataIndex;
              const comp = comps[i] || "Unknown";
              const v = context.parsed.y ?? 0;
              return `${comp}: ${v} talks`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: true }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}




// Speaker KPI
async function updateSpeakerMetrics(name, year) {
  const elTotal = document.getElementById("metricTotalTalks");
  const elYears = document.getElementById("metricActiveYears");
  const elTracks = document.getElementById("metricTracks");
  const elSummary = document.getElementById("metricSummary");

  if (!elTotal || !elYears || !elTracks || !elSummary) return;

  const paramsCount = new URLSearchParams({ name, year });
  const paramsTracks = new URLSearchParams({ name, year });

  const [resCount, resTracks] = await Promise.all([
    fetch(`/api/speaker_count?${paramsCount.toString()}`),
    fetch(`/api/speaker_tracks?${paramsTracks.toString()}`),
  ]);

  const countData = await resCount.json();
  const trackData = await resTracks.json();

  const totalTalks = countData.reduce((sum, row) => sum + (row.talks || 0), 0);
  const activeYears = countData.length;
  const tracks = trackData.length;

  elTotal.textContent = totalTalks || "0";
  elYears.textContent = activeYears || "0";
  elTracks.textContent = tracks || "0";

  if (!totalTalks) {
    elSummary.textContent = "No sessions found for this speaker with the current filters.";
  } else {
    const yearsArr = countData.map((r) => r.year).sort();
    const firstYear = yearsArr[0];
    const lastYear = yearsArr[yearsArr.length - 1];
    const yrText =
      firstYear === lastYear || yearsArr.length === 1
        ? `in ${firstYear}`
        : `from ${firstYear} to ${lastYear}`;

    if (year) {
      elSummary.textContent = `${name} held ${totalTalks} talk(s) in ${year} across ${
        tracks || 1
      } different track(s).`;
    } else {
      elSummary.textContent = `${name} contributed ${totalTalks} talk(s) ${yrText}, spanning ${
        tracks || 1
      } different track(s).`;
    }
  }
}

// Unique speakers per year
async function loadUniqueSpeakersPerYear() {
  if (!document.getElementById("uniqueSpeakersChart")) return;

  const res = await fetch("/api/unique_speakers_per_year");
  const data = await res.json();

  const topWrap = document.getElementById("topSpeakerWrap");
  const leftWrap = document.getElementById("uniqueSpeakersWrap");

  const labels = data.map((d) => d.year);
  const values = data.map((d) => d.speakers);

  renderLineChart(
    "uniqueSpeakersChart",
    labels,
    values,
    uniqueSpeakersChart,
    (c) => (uniqueSpeakersChart = c),
    "Unique speakers per year"
  );
}

// Top speakers
async function loadTopSpeakers() {
  if (!document.getElementById("topSpeakerChart")) return;

  const year = document.getElementById("topSpeakerYear")?.value || "";
  const res = await fetch(`/api/top_speakers?year=${year}&limit=15`);
  const data = await res.json();

  const topWrap = document.getElementById("topSpeakerWrap");
  const leftWrap = document.getElementById("uniqueSpeakersWrap");

  if (topWrap) {
    const rowH = 28; 
    const h = Math.max(260, data.length * rowH + 60);
    topWrap.style.height = `${h}px`;
    if (leftWrap) leftWrap.style.height = `${h}px`;
  }

  const labels = data.map((d) => d.name);
  const values = data.map((d) => d.talks);

  renderHBarChart(
    "topSpeakerChart",
    labels,
    values,
    topSpeakerChart,
    (c) => (topSpeakerChart = c),
    `Top Speakers ${year || ""}`
  );
}
let speakerSwitchChart = null;
let speakerSwitchersData = [];
let tdwiYearChart = null;

async function loadSpeakerCompanySwitchStats() {
  if (!document.getElementById("speakerSwitchChart")) return;

  const res = await fetch("/api/speaker_company_switch_stats");
  const stats = await res.json();

  const total = stats.total_speakers || 0;
  const switched = stats.switched_speakers || 0;
  const single = stats.single_company_speakers || 0;
  const pct = stats.switched_pct ?? 0;

  const elPct = document.getElementById("switchPct");
  const elCount = document.getElementById("switchCount");
  const elTotal = document.getElementById("switchTotal");
  if (elPct) elPct.textContent = pct;
  if (elCount) elCount.textContent = switched;
  if (elTotal) elTotal.textContent = total;

  renderPieChart(
    "speakerSwitchChart",
    ["Changed company (2+)", "Single company"],
    [switched, single],
    speakerSwitchChart,
    (c) => (speakerSwitchChart = c),
    "Company switching (global)",
    total
  );
}
async function loadTdwiSessions(name) {
  const res = await fetch(
    `/api/speaker_tdwi_sessions?name=${encodeURIComponent(name)}`
  );
  const data = await res.json();

  const block = document.getElementById("tdwiBlock");
  const body = document.getElementById("tdwiSessionsBody");

  body.innerHTML = "";

  if (!data.length) {
    block.style.display = "none";
    return;
  }

  block.style.display = "block";

  for (const r of data) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.year ?? ""}</td>
      <td>${r.date ?? ""}</td>
      <td>${r.start ?? ""} – ${r.end ?? ""}</td>
      <td>${r.track ?? ""}</td>
      <td>${r.title ?? ""}</td>
      <td>
        <span class="badge bg-secondary">
          ${r.affiliation}
        </span>
      </td>
    `;
    body.appendChild(tr);
  }
}

// ==============================
// Company Analysis
// ==============================
async function loadCompanyAnalysis() {
  const company = document.getElementById("companyName")?.value.trim();
  const year = document.getElementById("companyYear")?.value || "";

  if (!company) {
    alert("Enter company name");
    return;
  }

  await Promise.all([
    loadCompanyCount(company, year),
    loadCompanyLang(company, year),
    loadCompanyTracks(company, year),
    loadCompanySessions(company, year),
    loadCompanySpeakers(company, year),
    updateCompanyMetrics(company, year),
  ]);
}

// Talks per year
async function loadCompanyCount(companyArg, yearArg) {
  const company = companyArg ?? document.getElementById("companyName")?.value.trim();
  const year = yearArg ?? (document.getElementById("companyYear")?.value || "");

  if (!company || !document.getElementById("companyChart")) return;

  const res = await fetch(
    `/api/company_count?company=${encodeURIComponent(company)}&year=${year}`
  );
  const data = await res.json();

  const labels = data.map((d) => d.year);
  const values = data.map((d) => d.talks);

  renderBarChart(
    "companyChart",
    labels,
    values,
    companyChart,
    (c) => (companyChart = c),
    `${company} – talks per year`
  );
}

// CompanyLang
async function loadCompanyLang(company, year) {
  if (!document.getElementById("companyLangChart")) return;

  const params = new URLSearchParams({ company, year });
  const res = await fetch(`/api/company_langs?${params.toString()}`);
  const data = await res.json();

  if (!data.length) {
    if (companyLangChart) companyLangChart.destroy();
    return;
  }

  const labels = data.map((d) => langLabel(d.lang));
  const values = data.map((d) => d.talks);
  const total = values.reduce((a, b) => a + b, 0);

  renderPieChart(
    "companyLangChart",
    labels,
    values,
    companyLangChart,
    (c) => (companyLangChart = c),
    "Language distribution",
    total
  );
}

// Track 
async function loadCompanyTracks(company, year) {
  if (!document.getElementById("companyTrackChart")) return;

  const params = new URLSearchParams({ company, year });
  const res = await fetch(`/api/company_tracks?${params.toString()}`);
  const data = await res.json();

  if (!data.length) {
    if (companyTrackChart) companyTrackChart.destroy();
    return;
  }

  const labels = data.map((d) => d.track);
  const values = data.map((d) => d.talks);

  renderHBarChart(
    "companyTrackChart",
    labels,
    values,
    companyTrackChart,
    (c) => (companyTrackChart = c),
    "Track distribution"
  );
}

// Company session table
async function loadCompanySessions(company, year) {
  const tbody = document.getElementById("companySessionsBody");
  if (!tbody) return;

  const params = new URLSearchParams({ company, year });
  const res = await fetch(`/api/company_sessions?${params.toString()}`);
  const data = await res.json();

  tbody.innerHTML = data
    .map((r) => {
      const date = (r.date || "").split(" ")[0];
      const time = (r.start ?? "") + (r.end ? " – " + r.end : "");
      return `
        <tr>
          <td>${r.year ?? ""}</td>
          <td>${date}</td>
          <td>${time}</td>
          <td>${r.track ?? ""}</td>
          <td>${langLabel(r.lang)}</td>
          <td>${r.title ?? ""}</td>
          <td>${r.speaker ?? ""}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadCompanySpeakers(company, year) {
  if (!document.getElementById("companySpeakerChart")) return;

  const params = new URLSearchParams({ company, year, limit: 15 });
  const res = await fetch(`/api/company_speakers?${params.toString()}`);
  const data = await res.json();

  if (!data.length) {
    if (companySpeakerChart) companySpeakerChart.destroy();
    return;
  }

  const labels = data.map((d) => d.name);
  const values = data.map((d) => d.talks);

  renderHBarChart(
    "companySpeakerChart",
    labels,
    values,
    companySpeakerChart,
    (c) => (companySpeakerChart = c),
    "Top speakers for this company"
  );
}

// Company KPI
async function updateCompanyMetrics(company, year) {
  const elTotal = document.getElementById("metricCompanyTotalTalks");
  const elYears = document.getElementById("metricCompanyActiveYears");
  const elSpeakers = document.getElementById("metricCompanySpeakers");
  const elSummary = document.getElementById("metricCompanySummary");

  if (!elTotal || !elYears || !elSpeakers || !elSummary) return;

  const paramsCount = new URLSearchParams({ company, year });
  const paramsSpeakers = new URLSearchParams({ company, year, limit: 999 });

  const [resCount, resSpeakers] = await Promise.all([
    fetch(`/api/company_count?${paramsCount.toString()}`),
    fetch(`/api/company_speakers?${paramsSpeakers.toString()}`),
  ]);

  const countData = await resCount.json();
  const speakerData = await resSpeakers.json();

  const totalTalks = countData.reduce((sum, row) => sum + (row.talks || 0), 0);
  const activeYears = countData.length;
  const speakers = speakerData.length;

  elTotal.textContent = totalTalks || "0";
  elYears.textContent = activeYears || "0";
  elSpeakers.textContent = speakers || "0";

  if (!totalTalks) {
    elSummary.textContent = "No sessions found for this company with the current filters.";
  } else {
    const yearsArr = countData.map((r) => r.year).sort();
    const firstYear = yearsArr[0];
    const lastYear = yearsArr[yearsArr.length - 1];
    const yrText =
      firstYear === lastYear || yearsArr.length === 1
        ? `in ${firstYear}`
        : `from ${firstYear} to ${lastYear}`;

    if (year) {
      elSummary.textContent = `${company} delivered ${totalTalks} talk(s) in ${year}, represented by ${
        speakers || 1
      } speaker(s).`;
    } else {
      elSummary.textContent = `${company} delivered ${totalTalks} talk(s) ${yrText}, represented by ${
        speakers || 1
      } speaker(s).`;
    }
  }
}

// Unique companies per year
async function loadUniqueCompaniesPerYear() {
  if (!document.getElementById("uniqueCompaniesChart")) return;

  const res = await fetch("/api/unique_companies_per_year");
  const data = await res.json();

  const labels = data.map((d) => d.year);
  const values = data.map((d) => d.companies);

  renderLineChart(
    "uniqueCompaniesChart",
    labels,
    values,
    uniqueCompaniesChart,
    (c) => (uniqueCompaniesChart = c),
    "Unique companies per year"
  );
}

// Top companies
async function loadTopCompanies() {
  if (!document.getElementById("topCompanyChart")) return;

  const year = document.getElementById("topCompanyYear")?.value || "";
  const res = await fetch(`/api/top_companies?year=${year}&limit=15`);
  const data = await res.json();

  const topWrap = document.getElementById("topCompanyWrap");
  const leftWrap = document.getElementById("uniqueCompaniesWrap");

  if (topWrap) {
    const rowH = 28;
    const h = Math.max(260, data.length * rowH + 60);
    topWrap.style.height = `${h}px`;
    if (leftWrap) leftWrap.style.height = `${h}px`;
  }

  const labels = data.map((d) => d.company);
  const values = data.map((d) => d.talks);

  renderHBarChart(
    "topCompanyChart",
    labels,
    values,
    topCompanyChart,
    (c) => (topCompanyChart = c),
    `Top Companies ${year || ""}`
  );
}

// ==============================
// Chart helpers
// ==============================
function renderBarChart(canvasId, labels, values, oldChart, setChart, title) {
  if (oldChart) oldChart.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: title,
          data: values,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
    },
  });
  setChart(chart);
}

function renderHBarChart(canvasId, labels, values, oldChart, setChart, title) {
  if (oldChart) oldChart.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: title,
          data: values,
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
    },
  });
  setChart(chart);
}

function renderPieChart(canvasId, labels, values, oldChart, setChart, title, sum = null, unit = "talks") {
  if (oldChart) oldChart.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const _sum = sum ?? values.reduce((a, b) => a + b, 0);

  const chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data: values }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: false, text: title },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || "";
              const v = context.raw ?? 0;
              const pct = _sum ? ((v / _sum) * 100).toFixed(1) : 0;
              return `${label}: ${v} ${unit} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  setChart(chart);
}
async function loadSpeakerCompanySwitchStats() {
  if (!document.getElementById("speakerSwitchChart")) return;

  const res = await fetch("/api/speaker_company_switch_stats?min_companies=2");
  const data = await res.json();

  const labels = ["Changed company (2+)", "Single company"];
  const values = [data.changed || 0, data.single || 0];

  renderPieChart(
    "speakerSwitchChart",
    labels,
    values,
    speakerSwitchChart,
    (c) => (speakerSwitchChart = c),
    "Speakers who changed companies",
    data.total || values.reduce((a, b) => a + b, 0),
    "speakers"
  );

  const hint = document.getElementById("speakerSwitchHint");
  if (hint) {
    hint.textContent = `${data.changed || 0} of ${data.total || 0} speakers represented 2+ companies across years.`;
  }
}

function renderSpeakerSwitchList(list) {
  const tbody = document.getElementById("speakerSwitchListBody");
  if (!tbody) return;

  tbody.innerHTML = list
    .map((r) => {
      const name = r.name ?? "";
      const companiesCount = r.companies_count ?? "";
      const companies = (r.companies ?? "").split(",").slice(0, 6).join(", "); // 避免太長
      const years = (r.years ?? "").split(",").sort().join(", ");

      return `
        <tr>
          <td>
            <a href="javascript:void(0)" class="switch-speaker-link" data-name="${name}">
              ${name}
            </a>
          </td>
          <td class="text-nowrap">${companiesCount}</td>
          <td>${companies}</td>
          <td class="text-nowrap">${years}</td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".switch-speaker-link").forEach((a) => {
    a.addEventListener("click", () => {
      const nm = a.getAttribute("data-name") || "";
      const input = document.getElementById("speakerName");
      if (input) input.value = nm;
      if (typeof loadSpeakerAnalysis === "function") loadSpeakerAnalysis();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

async function loadSpeakersChangedCompaniesList() {
  const tbody = document.getElementById("speakerSwitchListBody");
  if (!tbody) return;

  const res = await fetch("/api/speakers_changed_companies?min_companies=2&limit=9999");
  speakerSwitchersData = await res.json();

  renderSpeakerSwitchList(speakerSwitchersData);

  const filter = document.getElementById("switchSpeakerFilter");
  if (filter && !filter.dataset.bound) {
    filter.dataset.bound = "1";
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      const filtered = !q
        ? speakerSwitchersData
        : speakerSwitchersData.filter((r) => {
            const name = (r.name || "").toLowerCase();
            const companies = (r.companies || "").toLowerCase();
            return name.includes(q) || companies.includes(q);
          });
      renderSpeakerSwitchList(filtered);
    });
  }
}

function renderLineChart(canvasId, labels, values, oldChart, setChart, title) {
  if (oldChart) oldChart.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: title,
          data: values,
          tension: 0.25,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
    },
  });
  setChart(chart);
}

function renderMultiLineChart(
  canvasId,
  labels,
  datasets,
  oldChart,
  setChart,
  title
) {
  if (oldChart) oldChart.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: false,
          text: title,
        },
      },
    },
  });
  setChart(chart);
}

// ==============================
// Auto init
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("topSpeakerChart")) {
    Promise.all([loadTopSpeakers(), loadUniqueSpeakersPerYear()]).then(() => {
      const topWrap = document.getElementById("topSpeakerWrap");
      const leftWrap = document.getElementById("uniqueSpeakersWrap");
      if (!topWrap || !leftWrap) return;
  
      const h = Math.max(topWrap.offsetHeight, leftWrap.offsetHeight);
      topWrap.style.height = `${h}px`;
      leftWrap.style.height = `${h}px`;
    });
  }
  if (document.getElementById("topCompanyChart") && document.getElementById("uniqueCompaniesChart")) {
    Promise.all([loadTopCompanies(), loadUniqueCompaniesPerYear()]).then(() => {
      const topWrap = document.getElementById("topCompanyWrap");
      const leftWrap = document.getElementById("uniqueCompaniesWrap");
      if (!topWrap || !leftWrap) return;
  
      const h = Math.max(topWrap.offsetHeight, leftWrap.offsetHeight);
      topWrap.style.height = `${h}px`;
      leftWrap.style.height = `${h}px`;
    });
  } else {
    if (document.getElementById("topCompanyChart")) loadTopCompanies();
    if (document.getElementById("uniqueCompaniesChart")) loadUniqueCompaniesPerYear();
  }
  
  if (document.getElementById("sessionsBody")) {
    loadSessions();
  }
  // speakers page init
if (document.getElementById("speakerSwitchChart")) {
  loadSpeakerCompanySwitchStats();
}

if (document.getElementById("speakerSwitchListBody")) {
  loadSpeakersChangedCompaniesList();
}

if (document.getElementById("tdwiExpertsBody")) {
  loadTdwiExpertsTop();
}

  
  // Speaker autocomplete
  const spInput = document.getElementById("speakerName");
  if (spInput) {
    const handler = debounce(() => {
      const q = spInput.value.trim();
      fetchSuggestions(
        "/api/speaker_suggest",
        q,
        "speakerSuggestions",
        "name"
      );
    }, 200);
    spInput.addEventListener("input", handler);
  }

  // Company autocomplete
  const coInput = document.getElementById("companyName");
  if (coInput) {
    const handler = debounce(() => {
      const q = coInput.value.trim();
      fetchSuggestions(
        "/api/company_suggest",
        q,
        "companySuggestions",
        "company"
      );
    }, 200);
    coInput.addEventListener("input", handler);
  }
});

// ==============================
// Sessions page
// ==============================
const SESS = (() => {
  const CHARTS = {};

  function getMode() {
    const el = document.getElementById("keywordMode");
    return (el && el.value) ? el.value : "tech";
  }

  function destroyChart(id) {
    if (CHARTS[id]) {
      CHARTS[id].destroy();
      delete CHARTS[id];
    }
  }

  /* ===== Wordcloud render (safe scaling) ===== */
  function renderWordCloud(el, items) {
    const data = items || [];
    el.innerHTML = "";

    if (!data.length) {
      el.innerHTML = "<div class='text-muted small p-3'>No data.</div>";
      return;
    }

    const maxCount = Math.max(...data.map(x => x.count || 0), 1);
    const list = data.map(x => {
      const c = Math.max(1, x.count || 1);
      const w = 8 + 72 * (Math.log(c + 1) / Math.log(maxCount + 1)); // log scale 8..80
      return [x.word, Math.round(w)];
    });

    const w = el.clientWidth || 600;

    // WordCloud2 needs global WordCloud
    if (typeof WordCloud !== "function") {
      el.innerHTML = "<div class='text-danger small p-3'>WordCloud library not loaded.</div>";
      return;
    }

    WordCloud(el, {
      list,
      gridSize: Math.max(8, Math.round(w / 80)),
      weightFactor: 1,
      minSize: 8,
      shrinkToFit: true,
      rotateRatio: 0.08,
      minRotation: 0,
      maxRotation: 0,
      backgroundColor: "transparent",
      drawOutOfBound: false,
      clearCanvas: true,
    });
  }

  function fmtPct(x) {
    if (x === null || x === undefined) return "-";
    return `${x}%`;
  }

  function fmtRange(arr) {
    if (!arr || arr.length < 2) return "-";
    return `${arr[0]}–${arr[1]}`;
  }

  async function loadYears() {
    const res = await fetch("/api/sessions/years").then(r => r.json());
    const years = res.years || [];

    const wcYear = document.getElementById("wcYear");
    const tfidfYear = document.getElementById("tfidfYear");
    if (!wcYear || !tfidfYear) return;

    wcYear.innerHTML = "";
    tfidfYear.innerHTML = "";

    wcYear.innerHTML += `<option value="all">All years</option>`;
    years.forEach(y => {
      wcYear.innerHTML += `<option value="${y}">${y}</option>`;
      tfidfYear.innerHTML += `<option value="${y}">${y}</option>`;
    });

    if (years.length) {
      tfidfYear.value = String(years[years.length - 1]);
      wcYear.value = String(years[years.length - 1]);
    }
  }

  async function loadOverview() {
    const data = await fetch("/api/sessions/overview").then(r => r.json());
    const s = data.summary || {};

    const kpiTotal = document.getElementById("kpiTotal");
    const kpiYears = document.getElementById("kpiYears");
    const kpiPeak = document.getElementById("kpiPeak");
    const kpiAbstract = document.getElementById("kpiAbstract");
    const pillTracks = document.getElementById("pillTracks");
    const pillDuration = document.getElementById("pillDuration");
    const canvas = document.getElementById("chartSessionsYoY");

    if (!kpiTotal || !kpiYears || !kpiPeak || !kpiAbstract || !pillTracks || !pillDuration || !canvas) return;
    if (typeof Chart === "undefined") return;

    kpiTotal.innerText = s.total_sessions ?? "-";
    kpiYears.innerText = fmtRange(s.years_covered);
    kpiPeak.innerText = s.peak_year ?? "-";
    kpiAbstract.innerText = fmtPct(s.pct_with_abstract);

    pillTracks.innerText = `Unique Tracks: ${s.unique_tracks_total ?? "-"}`;
    pillDuration.innerText = `Avg Duration: ${s.avg_duration_min ? (s.avg_duration_min + " min") : "-"}`;

    const years = (data.sessions_per_year || []).map(x => String(x.year));
    const counts = (data.sessions_per_year || []).map(x => x.n);

    const yoy = years.map(y => {
      const v = s.yoy_growth_pct ? s.yoy_growth_pct[y] : null;
      return v === null || v === undefined ? null : v;
    });

    destroyChart("sessionsyoy");
    CHARTS["sessionsyoy"] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: years,
        datasets: [
          { type: "bar", label: "Sessions", data: counts },
          { type: "line", label: "YoY growth (%)", data: yoy, yAxisID: "y1", tension: 0.25, spanGaps: true }
        ]
      },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Sessions" } },
          y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "YoY (%)" } }
        }
      }
    });
  }

  async function loadTracks() {
    const data = await fetch("/api/sessions/track_trends?top_k=10").then(r => r.json());
    const years = (data.years || []).map(String);
    const tracks = data.top_tracks || [];
    const pivot = data.pivot || {};
    const uniq = data.unique_tracks_per_year || {};

    const trackList = document.getElementById("trackList");
    const canvas = document.getElementById("chartTracks");
    if (!trackList || !canvas) return;
    if (typeof Chart === "undefined") return;

    trackList.innerHTML = "";
    tracks.forEach(t => trackList.innerHTML += `<span class="pill">${t}</span>`);

    const datasets = tracks.map((t) => ({
      label: t,
      data: years.map(y => (pivot[t] && pivot[t][y]) ? pivot[t][y] : 0),
      stack: "tracks"
    }));

    datasets.push({
      type: "line",
      label: "Unique tracks (year)",
      data: years.map(y => uniq[y] ?? 0),
      yAxisID: "y1",
      tension: 0.25,
      stack: undefined
    });

    destroyChart("tracks");
    CHARTS["tracks"] = new Chart(canvas, {
      type: "bar",
      data: { labels: years, datasets },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: "Sessions" } },
          y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Unique Tracks" } }
        }
      }
    });
  }

  /* Lang mapping */
  async function loadLang() {
    const data = await fetch("/api/sessions/lang_trends").then(r => r.json());
    const years = (data.years || []).map(String);
    const labels = data.labels || [];
    const pivot = data.pivot || {};

    const canvas = document.getElementById("chartLang");
    if (!canvas) return;
    if (typeof Chart === "undefined") return;

    const langMap = { 1: "EN", 0: "DE" };

    const datasets = labels.map(lab => ({
      label: (Object.prototype.hasOwnProperty.call(langMap, lab) ? langMap[lab] : `lang=${lab}`),
      data: years.map(y => pivot[String(lab)] ? (pivot[String(lab)][y] || 0) : 0),
      stack: "lang"
    }));

    destroyChart("lang");
    CHARTS["lang"] = new Chart(canvas, {
      type: "bar",
      data: { labels: years, datasets },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
      }
    });
  }

  /* Updated: only Abstract length chart (coverage removed) */
  async function loadTextStats() {
    const data = await fetch("/api/sessions/text_stats").then(r => r.json());
    const years = (data.years || []).map(String);
    const absLen = data.abstract_len || {};

    const canvas = document.getElementById("chartAbstractLen");
    if (!canvas) return;
    if (typeof Chart === "undefined") return;

    destroyChart("abslen");
    CHARTS["abslen"] = new Chart(canvas, {
      type: "line",
      data: {
        labels: years,
        datasets: [
          { label: "Abstract len mean", data: years.map(y => (absLen[y] && absLen[y].mean) ? absLen[y].mean : null), tension: 0.25, spanGaps: true },
          { label: "Abstract len median", data: years.map(y => (absLen[y] && absLen[y].median) ? absLen[y].median : null), tension: 0.25, spanGaps: true },
          { label: "Abstract len p75", data: years.map(y => (absLen[y] && absLen[y].p75) ? absLen[y].p75 : null), tension: 0.25, spanGaps: true },
        ]
      },
      options: { plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }
    });
  }

  async function loadWordCloud() {
    const yearEl = document.getElementById("wcYear");
    const fieldEl = document.getElementById("wcField");
    const el = document.getElementById("wordcloud");
    const topBox = document.getElementById("wcTopTerms");

    if (!yearEl || !fieldEl || !el || !topBox) return;

    const year = yearEl.value;
    const field = fieldEl.value;
    const mode = getMode();

    el.innerHTML = "<div class='text-muted small p-3'>Loading...</div>";

    const res = await fetch(`/api/sessions/wordcloud?year=${encodeURIComponent(year)}&field=${encodeURIComponent(field)}&mode=${encodeURIComponent(mode)}&top_n=80`)
      .then(r => r.json())
      .catch(err => ({ keywords: [], error: String(err) }));

    const items = res.keywords || [];
    renderWordCloud(el, items);

    topBox.innerHTML = "";
    items.slice(0, 18).forEach(x => {
      topBox.innerHTML += `<span class="badge-term">${x.word} (${x.count})</span>`;
    });
  }

  async function loadTFIDF() {
    const yEl = document.getElementById("tfidfYear");
    const canvas = document.getElementById("chartTFIDF");
    const btns = document.getElementById("termButtons");

    if (!yEl || !canvas || !btns) return;
    if (typeof Chart === "undefined") return;

    const y = yEl.value;
    const mode = getMode();

    const res = await fetch(`/api/sessions/trending_terms?year=${encodeURIComponent(y)}&top_n=15&mode=${encodeURIComponent(mode)}`).then(r => r.json());
    const top = res.top_terms || [];

    destroyChart("tfidf");
    CHARTS["tfidf"] = new Chart(canvas, {
      type: "bar",
      data: { labels: top.map(x => x.word), datasets: [{ label: "TF-IDF score", data: top.map(x => x.score) }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    btns.innerHTML = "";
    top.forEach(x => {
      btns.innerHTML += `<button class="btn btn-sm btn-light me-2 mb-2" data-term="${x.word}">${x.word}</button>`;
    });

    btns.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", async () => {
        await loadTermTrend(b.dataset.term);
      });
    });

    if (top.length) await loadTermTrend(top[0].word);
  }

  async function loadTermTrend(term) {
    const canvas = document.getElementById("chartTermTrend");
    if (!canvas) return;
    if (typeof Chart === "undefined") return;

    const mode = getMode();
    const res = await fetch(`/api/sessions/term_trend?term=${encodeURIComponent(term)}&mode=${encodeURIComponent(mode)}`).then(r => r.json());
    const years = (res.years || []).map(String);
    const trend = res.trend || {};

    destroyChart("termtrend");
    CHARTS["termtrend"] = new Chart(canvas, {
      type: "line",
      data: { labels: years, datasets: [{ label: `Frequency: ${term}`, data: years.map(y => trend[y] ?? 0), tension: 0.25 }] },
      options: { plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }
    });
  }

  async function loadClusters() {
    const kEl = document.getElementById("clusterK");
    const tbody = document.getElementById("clusterTable");
    const canvas = document.getElementById("chartClusterDist");

    if (!kEl || !tbody || !canvas) return;
    if (typeof Chart === "undefined") return;

    const k = kEl.value;
    const mode = getMode();

    const res = await fetch(`/api/sessions/clusters?k=${encodeURIComponent(k)}&mode=${encodeURIComponent(mode)}`).then(r => r.json());
    const years = (res.years || []).map(String);
    const pivot = res.pivot || {};
    const clusters = res.clusters || [];

    tbody.innerHTML = "";
    clusters.forEach(c => {
      tbody.innerHTML += `
        <tr>
          <td><b>${c.cluster}</b></td>
          <td>${(c.top_terms || []).join(", ")}</td>
        </tr>
      `;
    });

    const labels = clusters.map(c => String(c.cluster));
    const datasets = labels.map(lab => ({
      label: `Cluster ${lab}`,
      data: years.map(y => pivot[lab] ? (pivot[lab][y] || 0) : 0),
      stack: "cl"
    }));

    destroyChart("cldist");
    CHARTS["cldist"] = new Chart(canvas, {
      type: "bar",
      data: { labels: years, datasets },
      options: { plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });
  }

  function bindUI() {
    const btnReloadWC = document.getElementById("btnReloadWC");
    const btnReloadTFIDF = document.getElementById("btnReloadTFIDF");
    const btnReloadCluster = document.getElementById("btnReloadCluster");
    const btnReloadAll = document.getElementById("btnReloadAll");
    const keywordMode = document.getElementById("keywordMode");

    if (btnReloadWC) btnReloadWC.addEventListener("click", loadWordCloud);
    if (btnReloadTFIDF) btnReloadTFIDF.addEventListener("click", loadTFIDF);
    if (btnReloadCluster) btnReloadCluster.addEventListener("click", loadClusters);

    if (btnReloadAll) {
      btnReloadAll.addEventListener("click", async () => {
        await loadOverview();
        await loadTracks();
        await loadLang();
        await loadTextStats();
        await loadWordCloud();
        await loadTFIDF();
        await loadClusters();
      });
    }

    if (keywordMode) {
      keywordMode.addEventListener("change", async () => {
        await loadWordCloud();
        await loadTFIDF();
        await loadClusters();
      });
    }
  }

  async function init() {
    if (!document.getElementById("chartSessionsYoY")) return;

    bindUI();
    await loadYears();
    await loadOverview();
    await loadTracks();
    await loadLang();
    await loadTextStats();
    await loadWordCloud();
    await loadTFIDF();
    await loadClusters();
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => {
  SESS.init();
});