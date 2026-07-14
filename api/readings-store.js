import { db } from './firebase.js';

export async function fetchLatestReading() {
  const snapshot = await db.collection('readings')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  return snapshot.docs[0] ?? null;
}

export async function fetchReadingHistory({ from, to, limit, order }) {
  let query = db.collection('readings');
  if (from) {
    query = query.where('timestamp', '>=', from);
  }
  if (to) {
    query = query.where('timestamp', '<=', to);
  }

  const snapshot = await query
    .orderBy('timestamp', order)
    .limit(limit)
    .get();

  return snapshot.docs;
}
