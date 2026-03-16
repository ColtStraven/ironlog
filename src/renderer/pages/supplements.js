// IronLog · Supplements Page

const SupplementsPage = (() => {

  const SUPPLEMENTS = [
    {
      badge:    'F',
      badgeBg:  'var(--green-light)',
      badgeClr: 'var(--green)',
      title:    'Fish Oil (Sports Research)',
      sub:      'Wild Alaska Pollock · Triglyceride form',
      rows: [
        ['Softgels per day',  '2'],
        ['Fish oil concentrate', '2,500 mg'],
        ['Total omega-3s',    '2,080 mg'],
        ['EPA',               '1,380 mg'],
        ['DHA',               '520 mg'],
      ],
      timing:    'With meals · split if preferred',
      timingBg:  'var(--green-light)',
      timingClr: 'var(--green)',
      note: 'Reduced from 3 to 2 given bupropion. Still a full therapeutic dose. 90-softgel container = 45-day supply.',
    },
    {
      badge:    'D',
      badgeBg:  'var(--blue-light)',
      badgeClr: 'var(--blue)',
      title:    'D3 + K2 (Sports Research)',
      sub:      'Vegan · lichen-sourced D3 · MK-7 K2',
      rows: [
        ['Frequency',         'Every other day'],
        ['D3 per dose',       '5,000 IU (125 mcg)'],
        ['D3 daily average',  '~2,500 IU'],
        ['K2 (MK-7) per dose','100 mcg'],
      ],
      timing:    'With largest meal · fat aids absorption',
      timingBg:  'var(--blue-light)',
      timingClr: 'var(--blue)',
      note: 'Reduced from daily given sun exposure + multi adds 700 IU. Calcium labs normal (9.9). Reassess if moving to days full-time.',
    },
    {
      badge:    'C',
      badgeBg:  'var(--amber-light)',
      badgeClr: 'var(--amber)',
      title:    'Creatine Monohydrate (BulkSupplements)',
      sub:      'Micronized · no fillers · additive free',
      rows: [
        ['Daily dose',    '5 g'],
        ['Container size','1 kg'],
        ['Supply',        '200 days'],
      ],
      timing:    'Post-workout or same time daily',
      timingBg:  'var(--amber-light)',
      timingClr: 'var(--amber)',
      note: 'Timing is less important than consistency. Kidney function excellent (eGFR 106, creatinine 0.84) — no concerns.',
    },
    {
      badge:    'M',
      badgeBg:  '#EEEDFE',
      badgeClr: '#534AB7',
      title:    'Magnesium Glycinate (Sports Research)',
      sub:      'Chelated · high bioavailability',
      rows: [
        ['Capsules per day',      '2'],
        ['Elemental magnesium',   '160 mg'],
        ['Total mag w/ multi',    '~270 mg'],
        ['Container supply',      '45 days'],
      ],
      timing:    'Night shifts: end of shift (0730) · Days: bedtime',
      timingBg:  '#EEEDFE',
      timingClr: '#534AB7',
      note: 'Timed to support sleep onset. Glycinate form does the real work — multi\'s magnesium oxide has poor absorption.',
    },
    {
      badge:    'W',
      badgeBg:  'var(--green-pale)',
      badgeClr: 'var(--green-mid)',
      title:    'Whey Protein (ON Gold Standard)',
      sub:      'Chocolate Peanut Butter · 2 scoops',
      rows: [
        ['Serving',             '2 scoops'],
        ['Protein per serving', '~48–50 g'],
      ],
      timing:    'Post-workout',
      timingBg:  'var(--green-pale)',
      timingClr: 'var(--green)',
      note: 'Supports 175–196 g/day protein target. Count toward daily calories — roughly 240–260 kcal per 2-scoop serving.',
    },
    {
      badge:    'MV',
      badgeBg:  'var(--bg)',
      badgeClr: 'var(--text-2)',
      title:    'Multivitamin (Centrum Men)',
      sub:      '1 tablet daily · fills micronutrient gaps',
      rows: [
        ['Daily dose',             '1 tablet'],
        ['D3 contribution',        '700 IU'],
        ['Magnesium contribution', '110 mg (oxide)'],
        ['Zinc',                   '24 mg (218% DV)'],
      ],
      timing:    'With food',
      timingBg:  'var(--bg)',
      timingClr: 'var(--text-2)',
      note: 'Zinc is on the higher side but copper (2.2 mg) is included. B12 at 1042% DV is normal — water-soluble, excreted.',
    },
  ];

  function buildCard(s) {
    const rows = s.rows.map(([label, value]) => `
      <div class="supp-dose-row">
        <span class="supp-dose-label">${label}</span>
        <span class="supp-dose-value">${value}</span>
      </div>`).join('');

    return `
      <div class="supp-card">
        <div class="supp-card-header">
          <div class="supp-badge" style="background:${s.badgeBg};color:${s.badgeClr}">${s.badge}</div>
          <div>
            <div class="supp-title">${s.title}</div>
            <div class="supp-sub">${s.sub}</div>
          </div>
        </div>
        ${rows}
        <span class="supp-timing-tag" style="background:${s.timingBg};color:${s.timingClr}">${s.timing}</span>
        <p class="supp-note">${s.note}</p>
      </div>`;
  }

  function render() {
    const container = document.getElementById('supplements-content');

    const dailyTotal = `
      <div class="form-card" style="background:var(--surface-2)">
        <div class="section-label">Daily stack summary</div>
        <div class="metric-row cols-4">
          <div class="metric-card">
            <div class="metric-label">Supplements</div>
            <div class="metric-value">6</div>
            <div class="metric-unit">daily items</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Protein target</div>
            <div class="metric-value">175–196g</div>
            <div class="metric-unit">per day</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Creatine supply</div>
            <div class="metric-value">200</div>
            <div class="metric-unit">days remaining</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Fish oil supply</div>
            <div class="metric-value">45</div>
            <div class="metric-unit">days remaining</div>
          </div>
        </div>
      </div>`;

    const grid = `<div class="supp-grid">${SUPPLEMENTS.map(buildCard).join('')}</div>`;

    container.innerHTML = dailyTotal + grid;
  }

  Router.register('supplements', render);
  return { render };
})();
