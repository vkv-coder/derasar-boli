// ==========================================
// DERASAR BOLI - Events
// ==========================================

async function renderEvents() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>Events</h3>
        <button class="btn-accent btn-sm" onclick="showAddEventModal()">+ New Event</button>
      </div>
      <div id="events-list">Loading...</div>
    </div>
  `;
  await loadEventsList();
}

async function loadEventsList() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  const el = document.getElementById('events-list');
  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No events yet. Create your first event.</p></div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Event Name</th>
          <th>Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(ev => `
          <tr>
            <td><strong>${ev.name}</strong></td>
            <td>${formatDate(ev.event_date)}</td>
            <td>
              ${ev.is_live
                ? '<span class="badge badge-live"><span class="live-dot"></span>Live</span>'
                : '<span class="badge badge-draft">Draft</span>'}
            </td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn-sm btn-secondary" onclick="showEditEventModal('${ev.id}','${ev.name}','${ev.event_date || ''}')">Edit</button>
                ${ev.is_live
                  ? `<button class="btn-sm" style="background:#FF8F00;color:white;" onclick="toggleLive('${ev.id}',false)">Stop Live</button>`
                  : `<button class="btn-sm" style="background:#2E7D32;color:white;" onclick="toggleLive('${ev.id}',true)">Go Live</button>`}
                <button class="btn-sm btn-danger" onclick="deleteEvent('${ev.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function showAddEventModal() {
  showModal(`
    <div class="modal-title">New Event</div>
    <div class="form-group">
      <label>Event Name</label>
      <input type="text" id="ev-name" placeholder="e.g. Paryushan 2025" />
    </div>
    <div class="form-group">
      <label>Event Date (optional)</label>
      <input type="date" id="ev-date" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addEvent()">Save Event</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addEvent() {
  const name = document.getElementById('ev-name').value.trim();
  const date = document.getElementById('ev-date').value;
  if (!name) { showToast('Enter event name', 'error'); return; }

  const { error } = await db.from('events').insert({
    name,
    event_date: date || null,
    is_live: false
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Event created!', 'success');
  await loadEventsList();
}

function showEditEventModal(id, name, date) {
  showModal(`
    <div class="modal-title">Edit Event</div>
    <div class="form-group">
      <label>Event Name</label>
      <input type="text" id="ev-name-edit" value="${name}" />
    </div>
    <div class="form-group">
      <label>Event Date</label>
      <input type="date" id="ev-date-edit" value="${date}" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateEvent('${id}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateEvent(id) {
  const name = document.getElementById('ev-name-edit').value.trim();
  const date = document.getElementById('ev-date-edit').value;
  if (!name) { showToast('Enter event name', 'error'); return; }

  const { error } = await db.from('events').update({
    name,
    event_date: date || null
  }).eq('id', id);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Event updated!', 'success');
  await loadEventsList();
}

async function toggleLive(id, live) {
  const { error } = await db.from('events').update({ is_live: live }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(live ? '🟢 Event is now Live!' : '⏹ Event stopped', live ? 'success' : '');
  await loadEventsList();
}

async function deleteEvent(id) {
  if (!confirm('Delete this event? All heads and donations under it will also be deleted.')) return;
  const { error } = await db.from('events').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Event deleted');
  await loadEventsList();
}
