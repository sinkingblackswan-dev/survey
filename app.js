const hazards = [
  {
    name: 'Severe weather',
    description: 'Storms and flooding that disrupt operations and compromise safety.',
    likelihood: 0.7,
    severity: 0.8,
    metrics: {
      safety: 0.65,
      financial: 0.6,
      environmental: 0.7,
    },
  },
  {
    name: 'Cyber attack',
    description: 'Targeted intrusion leading to data loss and downtime.',
    likelihood: 0.55,
    severity: 0.85,
    metrics: {
      safety: 0.35,
      financial: 0.9,
      environmental: 0.2,
    },
  },
  {
    name: 'Wildfire',
    description: 'Fast-moving fires damaging facilities and ecosystems.',
    likelihood: 0.35,
    severity: 0.95,
    metrics: {
      safety: 0.85,
      financial: 0.7,
      environmental: 0.95,
    },
  },
  {
    name: 'Supply chain failure',
    description: 'Critical supplier outage causing extended service delays.',
    likelihood: 0.5,
    severity: 0.7,
    metrics: {
      safety: 0.45,
      financial: 0.8,
      environmental: 0.3,
    },
  },
  {
    name: 'Chemical spill',
    description: 'Release of hazardous substances affecting people and surroundings.',
    likelihood: 0.25,
    severity: 0.9,
    metrics: {
      safety: 0.9,
      financial: 0.65,
      environmental: 0.85,
    },
  },
];

const dimensionLabels = {
  safety: 'Safety & wellbeing',
  financial: 'Financial stability',
  environmental: 'Environmental impact',
};

const sliders = Array.from(
  document.querySelectorAll('#preferences-form input[type="range"]')
);
const outputs = new Map();
sliders.forEach((slider) => {
  const output = slider.parentElement.querySelector('output');
  outputs.set(slider.name, output);
});

const summaryOutputs = new Map(
  Array.from(document.querySelectorAll('[data-dimension]')).map((element) => [
    element.dataset.dimension,
    element,
  ])
);

const hazardChartCtx = document.getElementById('hazard-chart');
let hazardChart;

const hazardTable = document.querySelector('.hazard-table');
const topHazardName = document.querySelector('[data-top-hazard-name]');
const topHazardScore = document.querySelector('[data-top-hazard-score]');
const topHazardReason = document.querySelector('[data-top-hazard-reason]');

const DEFAULT_WEIGHTS = sliders.reduce((acc, slider) => {
  acc[slider.name] = Number(slider.value);
  return acc;
}, {});

function normaliseWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    const even = 1 / Object.keys(weights).length;
    return Object.fromEntries(
      Object.keys(weights).map((key) => [key, even])
    );
  }

  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total])
  );
}

function calculateScores(weights) {
  const normalised = normaliseWeights(weights);

  const scored = hazards
    .map((hazard) => {
      const contributions = Object.fromEntries(
        Object.entries(normalised).map(([key, weight]) => {
          const impact = hazard.metrics[key];
          const weighted = impact * weight;
          return [key, { weight, impact, weighted }];
        })
      );

      const preferenceFactor = Object.values(contributions).reduce(
        (total, { weighted }) => total + weighted,
        0
      );

      const baseRisk = hazard.likelihood * 0.4 + hazard.severity * 0.6;
      const score = baseRisk * (0.4 + 0.6 * preferenceFactor);

      return {
        ...hazard,
        preferenceFactor,
        baseRisk,
        score,
        contributions,
      };
    })
    .sort((a, b) => b.score - a.score);

  return { normalised, scored };
}

function renderChart(data) {
  const labels = data.map((hazard) => hazard.name);
  const scores = data.map((hazard) => Number(hazard.score.toFixed(3)));

  const dataset = {
    label: 'Priority score',
    data: scores,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.65)',
    hoverBackgroundColor: 'rgba(37, 99, 235, 0.85)',
    borderSkipped: false,
  };

  if (!hazardChart) {
    hazardChart = new Chart(hazardChartCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [dataset],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 1.2,
            ticks: {
              callback: (value) => value.toFixed(1),
            },
            title: {
              display: true,
              text: 'Composite risk score',
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const hazard = data[context.dataIndex];
                const priority = context.formattedValue;
                return [
                  `Priority score: ${priority}`,
                  `Likelihood: ${(hazard.likelihood * 100).toFixed(0)}%`,
                  `Severity: ${(hazard.severity * 100).toFixed(0)}%`,
                ];
              },
            },
          },
        },
      },
    });
  } else {
    hazardChart.data.labels = labels;
    hazardChart.data.datasets[0] = dataset;
    hazardChart.update();
  }
}

function renderTable(data, normalised) {
  hazardTable.innerHTML = '';
  hazardTable.dataset.weights = JSON.stringify(normalised);

  data.forEach((hazard, index) => {
    const card = document.createElement('article');
    card.className = 'hazard-card';
    const breakdownItems = Object.entries(hazard.contributions)
      .map(([key, details]) => {
        const label = dimensionLabels[key];
        const weightPercent = (details.weight * 100).toFixed(0);
        const impactPercent = (details.impact * 100).toFixed(0);
        const weightedPercent = (details.weighted * 100).toFixed(0);

        return `
          <li>
            <span>${label}</span>
            <span>${weightPercent}% × ${impactPercent}% = <strong>${weightedPercent}%</strong></span>
          </li>
        `;
      })
      .join('');

    card.innerHTML = `
      <h3>${index + 1}. ${hazard.name}</h3>
      <p>${hazard.description}</p>
      <div class="hazard-meta">
        <span>Priority score: ${hazard.score.toFixed(2)}</span>
        <span>Likelihood: ${(hazard.likelihood * 100).toFixed(0)}%</span>
        <span>Severity: ${(hazard.severity * 100).toFixed(0)}%</span>
      </div>
      <ul class="hazard-breakdown">${breakdownItems}</ul>
    `;
    hazardTable.appendChild(card);
  });
}

function updateOutputs(weights, normalised) {
  sliders.forEach((slider) => {
    const value = Number(slider.value);
    const output = outputs.get(slider.name);
    output.textContent = `${(value * 10).toFixed(0)}%`;
  });

  summaryOutputs.forEach((element, key) => {
    const percent = normalised[key] * 100;
    element.textContent = `${percent.toFixed(0)}%`;
  });
}

function collectWeights() {
  return sliders.reduce((acc, slider) => {
    acc[slider.name] = Number(slider.value);
    return acc;
  }, {});
}

function update() {
  const weights = collectWeights();
  const { normalised, scored } = calculateScores(weights);
  updateOutputs(weights, normalised);
  renderChart(scored);
  renderTable(scored, normalised);
  updateTopHazard(scored);
}

function updateTopHazard(data) {
  if (!topHazardName || !topHazardScore || !topHazardReason) {
    return;
  }

  const [first] = data;

  if (!first) {
    topHazardName.textContent = 'No hazards available';
    topHazardScore.textContent = '';
    topHazardReason.textContent = '';
    return;
  }

  topHazardName.textContent = first.name;
  topHazardScore.textContent = `Score ${first.score.toFixed(2)}`;

  const primaryContribution = Object.entries(first.contributions).reduce(
    (best, entry) => {
      if (!best || entry[1].weighted > best[1].weighted) {
        return entry;
      }
      return best;
    },
    null
  );

  if (!primaryContribution) {
    topHazardReason.textContent = '';
    return;
  }

  const [dimension, details] = primaryContribution;
  topHazardReason.textContent = `${dimensionLabels[dimension]} is contributing the most (${(
    details.weighted * 100
  ).toFixed(0)}% of the preference factor).`;
}

sliders.forEach((slider) => {
  slider.addEventListener('input', update, { passive: true });
});

const balanceButton = document.getElementById('balance-weights');
const resetButton = document.getElementById('reset-weights');

function setWeights(newWeights) {
  sliders.forEach((slider) => {
    if (newWeights[slider.name] !== undefined) {
      slider.value = newWeights[slider.name];
    }
  });
  update();
}

balanceButton?.addEventListener('click', () => {
  const weights = collectWeights();
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  const average = Math.round(sum / sliders.length);
  const balanced = sliders.reduce((acc, slider) => {
    acc[slider.name] = Math.min(
      Number(slider.max),
      Math.max(Number(slider.min), average)
    );
    return acc;
  }, {});
  setWeights(balanced);
});

resetButton?.addEventListener('click', () => {
  setWeights(DEFAULT_WEIGHTS);
});

document.addEventListener('DOMContentLoaded', () => {
  update();
});
