import React, { useState, useEffect } from "react";
import Papa from "papaparse";

// -----------------------------
// SCALE OPTIONS FOR USER INPUT
// -----------------------------
const SCALE_OPTIONS = [
  { value: 1, label: "1 – Not important" },
  { value: 2, label: "2 – Slightly important" },
  { value: 3, label: "3 – Moderately important" },
  { value: 4, label: "4 – Very important" },
  { value: 5, label: "5 – Extremely important" },
];

// -----------------------------
// CATEGORY DISPLAY (OPTIONAL)
// -----------------------------
const CATEGORY_META = {
  Hazard: { icon: "⚠️", color: "#dc2626" },
  "Risk context": { icon: "📍", color: "#2563eb" },
  "Impact – people": { icon: "🧑‍🤝‍🧑", color: "#7c3aed" },
  "Impact – services": { icon: "🏥", color: "#0f766e" },
  "Impact – economy": { icon: "💷", color: "#b45309" },
  "Impact – env": { icon: "🌍", color: "#15803d" },
  Recovery: { icon: "🛠️", color: "#6b7280" },
};
function getCategoryMeta(cat) {
  return CATEGORY_META[cat] || { icon: "📌", color: "#374151" };
}

// -----------------------------
// MAP SME LETTER (A–E) → PLANNING PRIORITY (0,1,3,5)
// -----------------------------
function letterToPriority(letter) {
  const l = String(letter).trim().toUpperCase();
  const map = {
    A: 0, // effectively "exclude" / very low planning priority
    B: 1, // low
    C: 3, // medium
    D: 5, // high
    E: 5, // also high (tweak later if you want)
  };
  return map[l] ?? 0;
}

// -----------------------------
// PROFILE CONFIG
// -----------------------------
const PROFILES = {
  all: {
    key: "all",
    label: "All attributes",
    description: "Uses every attribute equally.",
    categoryWeights: {},
    defaultForOthers: 1,
  },
  people: {
    key: "people",
    label: "People focus",
    description: "Prioritises human impacts and core planning attributes.",
    categoryWeights: {
      Hazard: 1,
      "Risk context": 1,
      "Impact – people": 1,
      Recovery: 1,
    },
    defaultForOthers: 0,
  },
  services: {
    key: "services",
    label: "Services focus",
    description: "Prioritises critical services and infrastructure.",
    categoryWeights: {
      Hazard: 1,
      "Risk context": 1,
      "Impact – services": 1,
      Recovery: 1,
    },
    defaultForOthers: 0,
  },
  economy_env: {
    key: "economy_env",
    label: "Economy & environment",
    description: "Prioritises economic and environmental impacts.",
    categoryWeights: {
      Hazard: 1,
      "Risk context": 1,
      "Impact – economy": 1,
      "Impact – env": 1,
      Recovery: 1,
    },
    defaultForOthers: 0,
  },
};

function getProfileMultiplier(profileKey, category) {
  const profile = PROFILES[profileKey] || PROFILES.all;
  const { categoryWeights, defaultForOthers } = profile;
  if (profileKey === "all") return 1;
  return categoryWeights[category] ?? defaultForOthers;
}

// -----------------------------
// PARSE EXPOSURE CSV (WOOD ET AL. FORMAT)
// - Uses `Code` as the hazard ID (matches "Hazard Code" in hazards.csv)
// - Computes weighted indices for:
//   • All assets: columns "1"–"5"
//   • Lands:      "Lands1"–"Lands5"
//   • Personnel:  "Personnel1"–"Personnel5"
//   • Buildings:  "Buildings1"–"Buildings5"
// -----------------------------
function parseExposureCsv(csvText) {
  const rows = Papa.parse(csvText, { header: true }).data || [];
  const exposureMap = {};
  const exposureTypesSet = new Set();

  const LEVELS = [1, 2, 3, 4, 5];

  function weightedIndex(row, prefix = "") {
    let sum = 0;
    LEVELS.forEach((lvl) => {
      const key = prefix ? `${prefix}${lvl}` : String(lvl);
      const raw = row[key];
      if (raw == null || raw === "" || raw === "N/A") return;
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) {
        sum += lvl * n;
      }
    });
    return sum;
  }

  rows.forEach((row) => {
    if (!row) return;

    // In your CSV this is the hazard code, e.g. "ADV_AS"
    const hazardId = row.Code || row["Code"];
    if (!hazardId) return;

    const metrics = {};

    // Overall (all assets) exposure from columns "1"–"5"
    const allIdx = weightedIndex(row, "");
    if (allIdx > 0) {
      metrics["All assets"] = allIdx;
      exposureTypesSet.add("All assets");
    }

    // Lands exposure from Lands1–Lands5
    const landsIdx = weightedIndex(row, "Lands");
    if (landsIdx > 0) {
      metrics["Lands"] = landsIdx;
      exposureTypesSet.add("Lands");
    }

    // Personnel exposure from Personnel1–Personnel5
    const persIdx = weightedIndex(row, "Personnel");
    if (persIdx > 0) {
      metrics["Personnel"] = persIdx;
      exposureTypesSet.add("Personnel");
    }

    // Buildings exposure from Buildings1–Buildings5
    const bldIdx = weightedIndex(row, "Buildings");
    if (bldIdx > 0) {
      metrics["Buildings"] = bldIdx;
      exposureTypesSet.add("Buildings");
    }

    // Hazards with N/A everywhere just don't get exposure metrics
    if (Object.keys(metrics).length === 0) return;

    exposureMap[hazardId] = metrics;
  });

  const exposureTypes = Array.from(exposureTypesSet);
  return { exposureMap, exposureTypes };
}

// -----------------------------
// MAIN APP COMPONENT
// -----------------------------
export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [attributes, setAttributes] = useState([]);
  const [hazards, setHazards] = useState([]);
  const [hazardWeights, setHazardWeights] = useState({});
  const [answers, setAnswers] = useState({});

  const [exposures, setExposures] = useState({});
  const [exposureTypes, setExposureTypes] = useState([]);

  const [index, setIndex] = useState(0);

  // -----------------------------
  // LOAD ALL CSV FILES
  // -----------------------------
  useEffect(() => {
    async function loadAll() {
      try {
        const base = import.meta.env.BASE_URL; // e.g. "/survey/"

        const [attrRes, hazRes, scoresRes] = await Promise.all([
          fetch(base + "attributes.csv"),
          fetch(base + "hazards.csv"),
          fetch(base + "hazard_attribute_scores_long.csv"),
        ]);

        const [attrText, hazText, scoresText] = await Promise.all([
          attrRes.text(),
          hazRes.text(),
          scoresRes.text(),
        ]);

        // Attributes
        const attrs = Papa.parse(attrText, { header: true }).data
          .map((row, i) => ({
            id: row.id || row.attribute_id || `ATTR_${i + 1}`,
            category: row.category || "Other",
            text: row.attribute_text,
          }))
          .filter((r) => r.text);

        // Hazards
        const haz = Papa.parse(hazText, { header: true }).data
          .map((row) => ({
            id: row["Hazard Code"],
            code: row["Hazard Code"],
            name: row["Hazard Descriptions"],
          }))
          .filter((r) => r.id);

        // SME hazard–attribute classes (A–E) → store BOTH letter and priority
        const scoreRows = Papa.parse(scoresText, { header: true }).data;
        const weightMap = {};
        scoreRows.forEach((r) => {
          const hazardId = r.hazard_id;
          const attrId = r.attribute_id;
          const scoreLetter = r.score_letter;

          if (!hazardId || !attrId || !scoreLetter) return;

          const letter = String(scoreLetter).trim().toUpperCase();
          const priority = letterToPriority(letter);

          if (!weightMap[hazardId]) weightMap[hazardId] = {};
          weightMap[hazardId][attrId] = {
            letter,
            priority,
          };
        });

        // Try to load exposure.csv (optional)
        let exposureMap = {};
        let exposureTypesLocal = [];
        try {
          const baseExpo = import.meta.env.BASE_URL;
          const expoRes = await fetch(baseExpo + "exposure.csv");
          if (expoRes.ok) {
            const expoText = await expoRes.text();
            const parsed = parseExposureCsv(expoText);
            exposureMap = parsed.exposureMap;
            exposureTypesLocal = parsed.exposureTypes;
          }
        } catch (e) {
          console.warn("Exposure CSV not loaded:", e);
        }

        setAttributes(attrs);
        setHazards(haz);
        setHazardWeights(weightMap);
        setExposures(exposureMap);
        setExposureTypes(exposureTypesLocal);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoadError("Could not load one or more CSV files.");
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  if (loading) return <div>Loading…</div>;
  if (loadError) return <div>{loadError}</div>;

  const total = attributes.length;
  const current = attributes[index];

  // -----------------------------
  // UPDATE USER IMPORTANCE
  // -----------------------------
  function setImportance(attrId, value) {
    setAnswers((a) => ({ ...a, [attrId]: value }));
  }

  function next() {
    if (answers[current.id] == null) setImportance(current.id, 3);
    if (index < total - 1) setIndex(index + 1);
    else setIndex(total);
  }

  function back() {
    if (index > 0) setIndex(index - 1);
  }

  function restart() {
    setAnswers({});
    setIndex(0);
  }

  // -----------------------------
  // AFTER SURVEY COMPLETE
  // -----------------------------
  if (index >= total) {
    return (
      <FinalResults
        attributes={attributes}
        hazards={hazards}
        answers={answers}
        hazardWeights={hazardWeights}
        exposures={exposures}
        exposureTypes={exposureTypes}
        restart={restart}
      />
    );
  }

  // -----------------------------
  // QUESTION SCREEN
  // -----------------------------
  return (
    <QuestionScreen
      attribute={current}
      index={index}
      total={total}
      value={answers[current.id]}
      onChange={setImportance}
      onNext={next}
      onBack={back}
      attributes={attributes}
    />
  );
}

// -----------------------------
// QUESTION SCREEN COMPONENT
// -----------------------------
function QuestionScreen({
  attribute,
  index,
  total,
  value,
  onChange,
  onNext,
  onBack,
  attributes,
}) {
  const selected = value ?? 3;
  const categoryItems = attributes.filter((a) => a.category === attribute.category);
  const catIndex = categoryItems.findIndex((a) => a.id === attribute.id);
  const { icon, color } = getCategoryMeta(attribute.category);

  const progress = Math.round(((index + 1) / total) * 100);

  return (
    <div className="card">
      <h2>
        <span style={{ marginRight: "0.5rem" }}>{icon}</span>
        {attribute.text}
      </h2>

      <p>
        Attribute {index + 1} of {total} ·{" "}
        <span style={{ color }}>
          {attribute.category} ({catIndex + 1} of {categoryItems.length})
        </span>
      </p>

      <div
        style={{
          height: "8px",
          background: "#e5e7eb",
          borderRadius: "999px",
          margin: "0.5rem 0 1rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "#4f46e5",
          }}
        />
      </div>

      {SCALE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          style={{ display: "block", marginBottom: "0.25rem" }}
        >
          <input
            type="radio"
            name={attribute.id}
            checked={selected === opt.value}
            onChange={() => onChange(attribute.id, opt.value)}
            style={{ marginRight: "0.5rem" }}
          />
          {opt.label}
        </label>
      ))}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={onBack} disabled={index === 0}>
          Back
        </button>
        <button onClick={onNext}>
          {index === total - 1 ? "See Results" : "Next"}
        </button>
      </div>
    </div>
  );
}

// -----------------------------
// PLANNING vs EXPOSURE SCATTER CHART (with quadrants)
// -----------------------------
function ResultsChart({ hazards, hasExposure }) {
  if (!hazards || hazards.length === 0) return null;

  const width = 700;
  const height = 320;
  const margin = 40;
  const innerWidth = width - margin * 2;
  const innerHeight = height - margin * 2;

  // thresholds for quadrants (tweak if you want)
  const PLAN_THRESHOLD = 50;
  const EXPO_THRESHOLD = 50;

  // If we don't have exposure data, fall back to simple 1D layout (score vs rank)
  if (!hasExposure) {
    const n = hazards.length;
    const yStep = n > 1 ? innerHeight / (n - 1) : 0;

    return (
      <svg
        width={width}
        height={height}
        style={{ border: "1px solid #e5e7eb", marginBottom: "1rem" }}
      >
        {/* X axis */}
        <line
          x1={margin}
          y1={height - margin}
          x2={width - margin}
          y2={height - margin}
          stroke="#9ca3af"
        />
        {[0, 25, 50, 75, 100].map((v) => {
          const x = margin + (v / 100) * innerWidth;
          return (
            <g key={v}>
              <line
                x1={x}
                y1={height - margin}
                x2={x}
                y2={height - margin + 5}
                stroke="#9ca3af"
              />
              <text
                x={x}
                y={height - margin + 18}
                fontSize="10"
                textAnchor="middle"
                fill="#4b5563"
              >
                {v}
              </text>
            </g>
          );
        })}
        <text
          x={width / 2}
          y={height - 5}
          fontSize="12"
          textAnchor="middle"
          fill="#111827"
        >
          Planning priority score (0–100)
        </text>

        {/* Points (score vs rank) */}
        {hazards.map((h, i) => {
          const x = margin + (h.normalised / 100) * innerWidth;
          const y = margin + i * yStep;
          return (
            <g key={h.id}>
              <circle cx={x} cy={y} r={4} fill="#4f46e5">
                <title>
                  {h.name} — {h.normalised}/100 ({h.band})
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
    );
  }

  // Full 2D plot: planning (x) vs exposure (y)
  const xThresh = margin + (PLAN_THRESHOLD / 100) * innerWidth;
  const yThresh =
    height - margin - (EXPO_THRESHOLD / 100) * innerHeight;

  return (
    <svg
      width={width}
      height={height}
      style={{ border: "1px solid #e5e7eb", marginBottom: "1rem" }}
    >
      {/* X axis */}
      <line
        x1={margin}
        y1={height - margin}
        x2={width - margin}
        y2={height - margin}
        stroke="#9ca3af"
      />
      {[0, 25, 50, 75, 100].map((v) => {
        const x = margin + (v / 100) * innerWidth;
        return (
          <g key={v}>
            <line
              x1={x}
              y1={height - margin}
              x2={x}
              y2={height - margin + 5}
              stroke="#9ca3af"
            />
            <text
              x={x}
              y={height - margin + 18}
              fontSize="10"
              textAnchor="middle"
              fill="#4b5563"
            >
              {v}
            </text>
          </g>
        );
      })}
      <text
        x={width / 2}
        y={height - 5}
        fontSize="12"
        textAnchor="middle"
        fill="#111827"
      >
        Planning priority score (0–100)
      </text>

      {/* Y axis */}
      <line
        x1={margin}
        y1={margin}
        x2={margin}
        y2={height - margin}
        stroke="#9ca3af"
      />
      {[0, 25, 50, 75, 100].map((v) => {
        const y = height - margin - (v / 100) * innerHeight;
        return (
          <g key={v}>
            <line
              x1={margin - 5}
              y1={y}
              x2={margin}
              y2={y}
              stroke="#9ca3af"
            />
            <text
              x={margin - 8}
              y={y + 3}
              fontSize="10"
              textAnchor="end"
              fill="#4b5563"
            >
              {v}
            </text>
          </g>
        );
      })}
      <text
        x={12}
        y={height / 2}
        fontSize="12"
        textAnchor="middle"
        fill="#111827"
        transform={`rotate(-90 12 ${height / 2})`}
      >
        Exposure index (0–100)
      </text>

      {/* Quadrant lines */}
      <line
        x1={xThresh}
        y1={margin}
        x2={xThresh}
        y2={height - margin}
        stroke="#d1d5db"
        strokeDasharray="4 4"
      />
      <line
        x1={margin}
        y1={yThresh}
        x2={width - margin}
        y2={yThresh}
        stroke="#d1d5db"
        strokeDasharray="4 4"
      />

      {/* Quadrant labels */}
      <text
        x={margin + innerWidth * 0.75}
        y={margin + innerHeight * 0.15}
        fontSize="11"
        textAnchor="middle"
        fill="#111827"
      >
        High planning / High exposure
      </text>
      <text
        x={margin + innerWidth * 0.25}
        y={margin + innerHeight * 0.15}
        fontSize="11"
        textAnchor="middle"
        fill="#111827"
      >
        Low planning / High exposure
      </text>
      <text
        x={margin + innerWidth * 0.25}
        y={margin + innerHeight * 0.90}
        fontSize="11"
        textAnchor="middle"
        fill="#111827"
      >
        Low planning / Low exposure
      </text>
      <text
        x={margin + innerWidth * 0.75}
        y={margin + innerHeight * 0.90}
        fontSize="11"
        textAnchor="middle"
        fill="#111827"
      >
        High planning / Low exposure
      </text>

      {/* Points */}
      {hazards.map((h) => {
        if (h.exposureNorm == null) return null;
        const x = margin + (h.normalised / 100) * innerWidth;
        const y =
          height - margin - (h.exposureNorm / 100) * innerHeight;
        return (
          <g key={h.id}>
            <circle cx={x} cy={y} r={4} fill="#4f46e5">
              <title>
                {h.name} — Planning {h.normalised}/100, Exposure{" "}
                {Math.round(h.exposureNorm)}/100 ({h.band})
              </title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

// -----------------------------
// FINAL RESULTS COMPONENT
// -----------------------------
function FinalResults({
  attributes,
  hazards,
  answers,
  hazardWeights,
  exposures,
  exposureTypes,
  restart,
}) {
  const [showTop10, setShowTop10] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [profileKey, setProfileKey] = useState("all");
  const [exposureType, setExposureType] = useState("");

  const activeExposureType =
    exposureTypes && exposureTypes.length
      ? exposureType || exposureTypes[0]
      : null;

  // Compute raw hazard planning scores:
  // sum_over_attributes( userImportance * classPriority * profileMultiplier )
  const raw = hazards.map((h) => {
    const weights = hazardWeights[h.id] || {};
    let total = 0;

    Object.entries(weights).forEach(([attrId, info]) => {
      const hzPriority =
        typeof info === "number" ? info : info.priority ?? 0;
      const userScore = answers[attrId] ?? 3;

      const attr = attributes.find((a) => a.id === attrId);
      const category = attr?.category || "Other";
      const profileMultiplier = getProfileMultiplier(profileKey, category);
      if (profileMultiplier === 0) return;

      total += hzPriority * userScore * profileMultiplier;
    });

    return { ...h, rawScore: total };
  });

  // Normalise planning scores to 0–100
  const max = Math.max(...raw.map((h) => h.rawScore), 1);
  raw.forEach((h) => {
    const norm = (h.rawScore / max) * 100;
    h.normalised = Math.round(norm);

    if (norm >= 67) h.band = "High";
    else if (norm >= 34) h.band = "Medium";
    else h.band = "Low";
  });

  // Attach exposure indices (if available) and normalise per chosen exposure metric
  let maxExposure = 0;
  if (activeExposureType) {
    raw.forEach((h) => {
      const hazardExpo = exposures[h.id];
      if (!hazardExpo) return;
      const v = hazardExpo[activeExposureType];
      if (typeof v === "number" && v > maxExposure) {
        maxExposure = v;
      }
    });
  }

  const hasExposure = activeExposureType && maxExposure > 0;

  raw.forEach((h) => {
    if (!hasExposure) {
      h.exposureRaw = null;
      h.exposureNorm = null;
      return;
    }
    const hazardExpo = exposures[h.id];
    if (!hazardExpo || typeof hazardExpo[activeExposureType] !== "number") {
      h.exposureRaw = null;
      h.exposureNorm = null;
      return;
    }
    const v = hazardExpo[activeExposureType];
    h.exposureRaw = v;
    h.exposureNorm = (v / maxExposure) * 100;
  });

  raw.sort((a, b) => b.normalised - a.normalised);

  const visible = showTop10 ? raw.slice(0, 10) : raw;

  function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  function exportCsv() {
    const header = [
      "Rank",
      "Hazard Code",
      "Hazard Name",
      "Score",
      "Band",
      hasExposure && activeExposureType
        ? `Exposure (${activeExposureType})`
        : null,
    ]
      .filter(Boolean)
      .join(",");

    const rows = raw.map((h, i) => {
      const code = h.code || h.id || "";
      const name = (h.name || "").replace(/"/g, '""');
      const exposureCol =
        hasExposure && activeExposureType && h.exposureRaw != null
          ? h.exposureRaw
          : "";
      const cols = [i + 1, code, `"${name}"`, h.normalised, h.band];
      if (hasExposure && activeExposureType) cols.push(exposureCol);
      return cols.join(",");
    });

    const csv = [header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hazard_planning_priorities.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h2>Your Hazard Planning Priorities</h2>

      <p style={{ marginBottom: "0.5rem" }}>
        Scores reflect your attribute importance ratings combined with the
        SME hazard classes. Values are normalised so the highest hazard = 100.
      </p>

      {/* Profile selector */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          margin: "0.75rem 0",
        }}
      >
        {Object.values(PROFILES).map((p) => (
          <button
            key={p.key}
            onClick={() => setProfileKey(p.key)}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: "999px",
              border:
                profileKey === p.key
                  ? "2px solid #4f46e5"
                  : "1px solid #d1d5db",
              backgroundColor:
                profileKey === p.key ? "#eef2ff" : "white",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: "0.85rem", color: "#4b5563" }}>
        {PROFILES[profileKey].description}
      </p>

      {/* Exposure presets + selector */}
      {exposureTypes && exposureTypes.length > 0 && (
        <div
          style={{
            marginTop: "0.75rem",
            marginBottom: "0.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {/* Preset buttons for key exposure views */}
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {["All assets", "Lands", "Personnel", "Buildings"]
              .filter((t) => exposureTypes.includes(t))
              .map((t) => (
                <button
                  key={t}
                  onClick={() => setExposureType(t)}
                  style={{
                    padding: "0.2rem 0.6rem",
                    borderRadius: "999px",
                    border:
                      activeExposureType === t
                        ? "2px solid #0f766e"
                        : "1px solid #d1d5db",
                    backgroundColor:
                      activeExposureType === t ? "#ecfdf5" : "white",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
          </div>

          {/* Fallback / advanced selector for any other exposure metrics */}
          <label style={{ fontSize: "0.9rem" }}>
            Exposure measure:
            <select
              value={activeExposureType || ""}
              onChange={(e) => setExposureType(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            >
              {exposureTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            Hazards without data for this exposure measure won’t appear on the
            exposure axis.
          </span>
        </div>
      )}

      {/* Top 10 toggle + export */}
      <div
        style={{
          margin: "0.75rem 0 1rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={showTop10}
            onChange={() => setShowTop10(!showTop10)}
            style={{ marginRight: "0.5rem" }}
          />
          Show top 10 only
        </label>

        <button onClick={exportCsv}>Download CSV (all hazards)</button>
      </div>

      {/* Graph */}
      <ResultsChart hazards={visible} hasExposure={hasExposure} />

      {/* Table / list */}
      <ol>
        {visible.map((h) => (
          <li key={h.id} style={{ marginBottom: "0.75rem" }}>
            <strong>
              {h.name} — {h.normalised} / 100 ({h.band} priority)
            </strong>
            {hasExposure && h.exposureNorm != null && (
              <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                · Exposure: {Math.round(h.exposureNorm)} / 100
              </span>
            )}

            <div
              style={{
                marginTop: "0.25rem",
                height: "6px",
                background: "#e5e7eb",
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${h.normalised}%`,
                  height: "100%",
                  background:
                    h.band === "High"
                      ? "#b91c1c"
                      : h.band === "Medium"
                      ? "#f59e0b"
                      : "#10b981",
                }}
              />
            </div>

            <div style={{ marginTop: "0.25rem" }}>
              <button onClick={() => toggleExpand(h.id)}>
                {expanded[h.id]
                  ? "▼ Why is this hazard ranked this way?"
                  : "▶ Why is this hazard ranked this way?"}
              </button>
            </div>

            {expanded[h.id] && (
              <HazardBreakdown
                hazard={h}
                attributes={attributes}
                answers={answers}
                hazardWeights={hazardWeights[h.id]}
              />
            )}
          </li>
        ))}
      </ol>

      <button onClick={restart}>Start again</button>
    </div>
  );
}

// -----------------------------
// HAZARD BREAKDOWN TABLE
// -----------------------------
function HazardBreakdown({ hazard, attributes, answers, hazardWeights }) {
  if (!hazardWeights) return <p>No scoring available for this hazard.</p>;

  const rows = Object.entries(hazardWeights).map(([attrId, info]) => {
    const attr = attributes.find((a) => a.id === attrId);
    const userImp = answers[attrId] ?? 3;

    const hzPriority =
      typeof info === "number" ? info : info.priority ?? 0;
    const hzLetter =
      typeof info === "number"
        ? ({ 0: "A", 1: "B", 2: "C", 3: "D", 4: "E", 5: "E" }[info] || "?")
        : info.letter || "?";

    return {
      attribute: attr?.text || attrId,
      category: attr?.category || "",
      userImp,
      hazardScoreNum: hzPriority,
      hazardScoreLetter: hzLetter,
      contribution: userImp * hzPriority,
    };
  });

  rows.sort((a, b) => b.contribution - a.contribution);

  return (
    <table
      style={{
        marginTop: "1rem",
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.85rem",
      }}
    >
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "0.25rem" }}>Attribute</th>
          <th style={{ textAlign: "left", padding: "0.25rem" }}>Category</th>
          <th style={{ textAlign: "left", padding: "0.25rem" }}>
            Your importance
          </th>
          <th style={{ textAlign: "left", padding: "0.25rem" }}>
            SME class → planning priority
          </th>
          <th style={{ textAlign: "left", padding: "0.25rem" }}>
            Contribution
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: "0.25rem" }}>{r.attribute}</td>
            <td style={{ padding: "0.25rem" }}>{r.category}</td>
            <td style={{ padding: "0.25rem" }}>{r.userImp}</td>
            <td style={{ padding: "0.25rem" }}>
              {r.hazardScoreLetter} → {r.hazardScoreNum}
            </td>
            <td style={{ padding: "0.25rem" }}>{r.contribution}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
