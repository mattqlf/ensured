import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Assuming the 'tests' directory is a sibling of 'ensured-app'
    const filePath = path.join(process.cwd(), '../tests/test_cases.json');
    
    if (!fs.existsSync(filePath)) {
       // If the specific file doesn't exist, try the one we saw earlier
       const fallbackPath = path.join(process.cwd(), '../tests/llm_tests.json');
       if (fs.existsSync(fallbackPath)) {
           const fileContents = fs.readFileSync(fallbackPath, 'utf8');
           return NextResponse.json(JSON.parse(fileContents));
       }
      return NextResponse.json({ error: 'test_cases.json not found' }, { status: 404 });
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContents);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading test cases:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
