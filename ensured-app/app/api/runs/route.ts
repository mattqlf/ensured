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
  project_id?: string;
  project_name?: string;
  repo_url?: string;
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
    const { run_id, url, prompt, status, transcript, timestamp, project_id, project_name, repo_url } = body;

    if (!run_id || !url || !prompt || !status) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Admin SDK syntax: collection(...).doc(...)
    const runData: any = {
      run_id,
      url,
      prompt,
      status,
      transcript: transcript || [],
      timestamp: timestamp || new Date().toISOString(),
    };

    if (project_id) runData.project_id = project_id;
    if (project_name) runData.project_name = project_name;
    if (repo_url) runData.repo_url = repo_url;

    await db.collection('users').doc(uid).collection('test_runs').doc(run_id).set(runData);

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

    const runs: Run[] = runsSnapshot.docs.map(doc => {
      const data = doc.data();
      let timestamp = data.timestamp;
      if (timestamp && typeof (timestamp as any).toDate === 'function') {
        timestamp = (timestamp as any).toDate().toISOString();
      } else if (typeof timestamp !== 'string') {
        timestamp = new Date().toISOString();
      }

      return {
        ...(data as Omit<Run, 'timestamp' | 'transcript'>),
        timestamp: timestamp as string,
        transcript: data.transcript || [],
      };
    });
    return NextResponse.json(runs);
  } catch (error: any) {
    console.error('Error fetching runs:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
