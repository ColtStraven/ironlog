// IronLog · Exercises Page

const ExercisesPage = (() => {

  const CATEGORIES = ['push','pull','legs','core','cardio','other'];
  const EQUIPMENT  = ['dumbbell','barbell','cable','machine','bodyweight','other'];

  async function render() {
    const exercises = await window.api.exercises.list();
    const container = document.getElementById('exercises-content');
    container.innerHTML = buildPage(exercises);
    bindEvents();
  }

  function buildPage(exercises) {
    const grouped = {};
    CATEGORIES.forEach(c => grouped[c] = []);
    exercises.forEach(e => { if (grouped[e.category]) grouped[e.category].push(e); });

    const rows = exercises.map(e => `
      <tr>
        <td style="font-weight:500">${e.name}</td>
        <td><span class="tag tag-${catColor(e.category)}">${e.category}</span></td>
        <td style="color:var(--text-2)">${e.muscle_group}</td>
        <td style="color:var(--text-3)">${e.equipment}</td>
        <td>
          <button class="del-btn" onclick="ExercisesPage.deleteExercise(${e.id},'${e.name.replace(/'/g,"\\'")}')">✕</button>
        </td>
      </tr>`).join('');

    return `
      <!-- Add form -->
      <div class="form-card">
        <div class="section-label">Add exercise</div>
        <div class="form-row">
          <div class="form-group grow">
            <label>Name</label>
            <input type="text" id="ex-name" placeholder="Dumbbell Bench Press">
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="ex-category">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group grow">
            <label>Muscle Group</label>
            <input type="text" id="ex-muscle" placeholder="chest, lateral delt, lats…">
          </div>
          <div class="form-group">
            <label>Equipment</label>
            <select id="ex-equipment">
              ${EQUIPMENT.map(e => `<option value="${e}">${e}</option>`).join('')}
            </select>
          </div>
          <div style="padding-top:18px">
            <button class="btn primary" id="ex-add-btn">Add</button>
          </div>
        </div>
        <div id="ex-msg" style="font-size:12px;color:var(--red);margin-top:4px"></div>
      </div>

      <!-- List -->
      <div class="form-card" style="padding:0;overflow:hidden">
        ${exercises.length === 0
          ? `<div class="empty-state"><div class="empty-title">No exercises yet</div><p>Add your first exercise above.</p></div>`
          : `<table class="set-table" style="width:100%">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Muscle Group</th>
                  <th>Equipment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
        }
      </div>`;
  }

  function catColor(cat) {
    const map = { push:'green', pull:'blue', legs:'amber', core:'amber', cardio:'blue', other:'blue' };
    return map[cat] || 'blue';
  }

  function bindEvents() {
    document.getElementById('ex-add-btn').addEventListener('click', async () => {
      const name      = document.getElementById('ex-name').value.trim();
      const category  = document.getElementById('ex-category').value;
      const muscle    = document.getElementById('ex-muscle').value.trim();
      const equipment = document.getElementById('ex-equipment').value;
      const msg       = document.getElementById('ex-msg');

      if (!name)   { msg.textContent = 'Name is required.'; return; }
      if (!muscle) { msg.textContent = 'Muscle group is required.'; return; }
      msg.textContent = '';

      try {
        await window.api.exercises.add({ name, category, muscle_group: muscle, equipment, notes: null });
        render();
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          msg.textContent = `"${name}" already exists.`;
        } else {
          msg.textContent = 'Error adding exercise.';
          console.error(err);
        }
      }
    });
  }

  async function deleteExercise(id, name) {
    if (!confirm(`Remove "${name}" from your exercise list?`)) return;
    await window.api.exercises.delete(id);
    render();
  }

  Router.register('exercises', render);

  return { render, deleteExercise };
})();
