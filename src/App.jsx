import React, { useState, useEffect } from "react";
import Papa from "papaparse";   // ← ADD THIS

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
// MAP A–E → NUMERIC 1–5
// -----------------------------
function letterToNumber(letter) {
  const map = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  return map[String(letter).trim().toUpperCase()] || 0;
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

        const attrs = Papa.parse(attrText, { header: true }).data
          .map((row, i) => ({
            id: row.id || row.attribute_id || `ATTR_${i + 1}`,
            category: row.category || "Other",
            text: row.attribute_text,
          }))
          .filter((r) => r.text);

        const haz = Papa.parse(hazText, { header: true }).data
          .map((row) => ({
            id: row["Hazard Code"],
            code: row["Hazard Code"],
            name: row["Hazard Descriptions"],
          }))
          .filter((r) => r.id);

        const scoreRows = Papa.parse(scoresText, { header: true }).data;
        const weightMap = {};
        scoreRows.forEach((r) => {
          if (!r.hazard_id || !r.attribute_id || !r.score_letter) return;
          const n = letterToNumber(r.score_letter);
          if (!weightMap[r.hazard_id]) weightMap[r.hazard_id] = {};
          weightMap[r.hazard_id][r.attribute_id] = n;
        });

        setAttributes(attrs);
        setHazards(haz);
        setHazardWeights(weightMap);
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

  return (
    <div className="card">
      <h2>{attribute.text}</h2>
      <p>Attribute {index + 1} of {total}</p>
      <p>
        {attribute.category} ({catIndex + 1} of {categoryItems.length})
      </p>

      {SCALE_OPTIONS.map((opt) => (
        <label key={opt.value}>
          <input
            type="radio"
            name={attribute.id}
            checked={selected === opt.value}
            onChange={() => onChange(attribute.id, opt.value)}
          />
          {opt.label}
        </label>
      ))}

      <div>
        <button onClick={onBack} disabled={index === 0}>Back</button>
        <button onClick={onNext}>{index === total - 1 ? "See Results" : "Next"}</button>
      </div>
    </div>
  );
}

// -----------------------------
// FINAL RESULTS COMPONENT
// -----------------------------
function FinalResults({ attributes, hazards, answers, hazardWeights, restart }) {
  const [showTop10, setShowTop10] = useState(false);
  const [expanded, setExpanded] = useState({});

  // Compute raw hazard scores
  const raw = hazards.map((h) => {
    const weights = hazardWeights[h.id] || {};
    let total = 0;
    Object.entries(weights).forEach(([attrId, hzScore]) => {
      const userScore = answers[attrId] ?? 3;
      total += hzScore * userScore;
    });
    return { ...h, rawScore: total };
  });

  // Normalise to 0–100
  const max = Math.max(...raw.map((h) => h.rawScore), 1);
  raw.forEach((h) => (h.normalised = Math.round((h.rawScore / max) * 100)));

  raw.sort((a, b) => b.normalised - a.normalised);

  const visible = showTop10 ? raw.slice(0, 10) : raw;

  function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div className="card">
      <h2>Your Hazard Planning Priorities</h2>

      <label>
        <input
          type="checkbox"
          checked={showTop10}
          onChange={() => setShowTop10(!showTop10)}
        />
        Show top 10 only
      </label>

      <ol>
        {visible.map((h, i) => (
          <li key={h.id}>
            <strong>
              {h.name} — {h.normalised} / 100
            </strong>

            <div>
              <button onClick={() => toggleExpand(h.id)}>
                {expanded[h.id] ? "▼ Why is this hazard ranked this way?" : "▶ Why is this hazard ranked this way?"}
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

  const rows = Object.entries(hazardWeights).map(([attrId, hzNum]) => {
    const attr = attributes.find((a) => a.id === attrId);
    const userImp = answers[attrId] ?? 3;

    const letter = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" }[hzNum] || "?";

    return {
      attribute: attr?.text || attrId,
      userImp,
      hazardScoreNum: hzNum,
      hazardScoreLetter: letter,
      contribution: userImp * hzNum,
    };
  });

  rows.sort((a, b) => b.contribution - a.contribution);

  return (
    <table style={{ marginTop: "1rem", width: "100%" }}>
      <thead>
        <tr>
          <th>Attribute</th>
          <th>User Importance</th>
          <th>Hazard Score</th>
          <th>Contribution</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.attribute}</td>
            <td>{r.userImp}</td>
            <td>
              {r.hazardScoreNum} ({r.hazardScoreLetter})
            </td>
            <td>{r.contribution}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
