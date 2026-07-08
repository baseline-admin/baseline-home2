/* ============================================================
   BASELINE - db.js
   Supabase database helpers — profiles, workouts, scores, sharing.
   Depends on: app.js (sb client, State)
   ============================================================ */

async function dbGetProfile() {
  var { data } = await sb.from('profiles').select('*').eq('id', State.currentUser.id).single();
  return data;
}

async function dbUpsertProfile(firstName, displayId) {
  var payload = { id: State.currentUser.id, first_name: firstName, email: State.currentUser.email };
  if (displayId) payload.display_id = displayId;
  var { data } = await sb.from('profiles').upsert(payload).select().single();
  return data;
}

function randomSuffix() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var s = '';
  for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function buildDisplayId(name) {
  var clean = (name || '').replace(/\s+/g, '');
  return clean + '_' + randomSuffix();
}

async function dbLookupUserByDisplayId(displayId) {
  var { data } = await sb.from('profiles').select('id, first_name, display_id').eq('display_id', displayId).maybeSingle();
  return data;
}

async function dbShareWorkout(workout, recipientDisplayIds) {
  var senderDisplayId = (State.cachedProfile && State.cachedProfile.display_id) || '';
  var results = [];
  for (var i = 0; i < recipientDisplayIds.length; i++) {
    var rid = recipientDisplayIds[i].trim();
    if (!rid) continue;
    var recipient = await dbLookupUserByDisplayId(rid);
    if (!recipient) { results.push({ id: rid, ok: false, reason: 'not found' }); continue; }
    if (recipient.id === State.currentUser.id) { results.push({ id: rid, ok: false, reason: 'cannot share with yourself' }); continue; }
    var workoutDataCopy = JSON.parse(JSON.stringify(workout.workout_data || {}));
    workoutDataCopy.sharedBy = senderDisplayId;
    try {
      await sb.from('workouts').insert({
        user_id: recipient.id,
        title: workout.title,
        prompt: workout.prompt,
        time_selection: workout.time_selection,
        workout_data: workoutDataCopy,
        shared_by_display_id: senderDisplayId,
        is_shared: true,
        seen: false
      });
      results.push({ id: rid, ok: true });
    } catch(e) {
      results.push({ id: rid, ok: false, reason: 'error' });
    }
  }
  return results;
}

async function dbHasUnseenSharedWorkouts() {
  var { data } = await sb.from('workouts')
    .select('id')
    .eq('user_id', State.currentUser.id)
    .eq('is_shared', true)
    .eq('seen', false)
    .limit(1);
  return !!(data && data.length);
}

async function dbMarkSharedWorkoutsSeen() {
  await sb.from('workouts')
    .update({ seen: true })
    .eq('user_id', State.currentUser.id)
    .eq('is_shared', true)
    .eq('seen', false);
}

async function dbGetWorkouts() {
  var { data } = await sb.from('workouts')
    .select('*, scores(*)')
    .eq('user_id', State.currentUser.id)
    .order('generated_at', { ascending: false });
  State.cachedWorkouts = data || [];
  return State.cachedWorkouts;
}

async function dbInsertWorkout(title, prompt, timeSelection, workoutData) {
  var { data, error } = await sb.from('workouts')
    .insert({ user_id: State.currentUser.id, title:title, prompt:prompt, time_selection:timeSelection, workout_data:workoutData })
    .select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteWorkout(id) {
  await sb.from('workouts').delete().eq('id', id).eq('user_id', State.currentUser.id);
}

async function dbInsertScore(workoutId, scoresData) {
  var { data, error } = await sb.from('scores')
    .insert({ workout_id:workoutId, user_id:State.currentUser.id, scores_data:scoresData, completed_at:new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

async function dbDeleteScore(id) {
  await sb.from('scores').delete().eq('id', id).eq('user_id', State.currentUser.id);
}

// ── Pro consultation bookings ────────────────────────────
// pro_booked_slots is a view exposing only slot_datetime (no user/email/notes)
// so any signed-in user can see which slots are taken without seeing whose
// booking it is. See supabase/pro_bookings.sql for the schema + RLS setup.

async function dbGetProBookedSlots(startISO, endISO) {
  var { data, error } = await sb.from('pro_booked_slots')
    .select('slot_datetime')
    .gte('slot_datetime', startISO)
    .lte('slot_datetime', endISO);
  if (error) throw error;
  return data || [];
}

async function dbCreateProBooking(slotISO, email, notes) {
  var { data, error } = await sb.from('pro_bookings')
    .insert({ user_id: State.currentUser.id, slot_datetime: slotISO, email: email, notes: notes || null })
    .select().single();
  if (error) throw error;
  return data;
}
