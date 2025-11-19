import { NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { Run, TranscriptStep } from '@/types';

interface CreateRunRequestBody {
  run_id: string;
  url: string;
  prompt: string;
  status: Run['status'];
  transcript?: TranscriptStep[];
  timestamp?: string;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.split('Bearer ')[1];
  let uid: string;

  try {
    const decodedToken = await auth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
    console.error('Error verifying token:', error);
    return NextResponse.json({ error: `Invalid token: ${error.message}` }, { status: 401 });
  }

  try {
    const body: CreateRunRequestBody = await request.json();
    const { run_id, url, prompt, status, transcript, timestamp } = body;

    if (!run_id || !url || !prompt || !status) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Admin SDK syntax: collection(...).doc(...)
    await db.collection('users').doc(uid).collection('test_runs').doc(run_id).set({
      run_id,
      url,
      prompt,
      status,
      transcript: transcript || [],
      timestamp: timestamp || new Date().toISOString(),
    });

    return NextResponse.json({ success: true, run_id });
  } catch (error: any) {
    console.error('Error writing to Firestore:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.split('Bearer ')[1];
  let uid: string;

  try {
    const decodedToken = await auth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
    console.error('Error verifying token:', error);
    return NextResponse.json({ error: `Invalid token: ${error.message}` }, { status: 401 });
  }

  try {
    const runsSnapshot = await db.collection('users').doc(uid).collection('test_runs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const runs: Run[] = runsSnapshot.docs.map(doc => ({
      ...(doc.data() as Omit<Run, 'timestamp' | 'transcript'>),
      timestamp: doc.data().timestamp.toDate().toISOString(),
      transcript: doc.data().transcript || [],
    }));
    return NextResponse.json(runs);
  } catch (error: any) {
    console.error('Error fetching runs:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
