import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { Job } from '@/lib/models';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    // Check authentication
    const token = request.cookies.get('auth_token')?.value;
    const userPayload = token ? verifyToken(token) : null;

    if (!userPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, job, source } = body;

    // Validate that the user can only save jobs for themselves
    if (userId !== userPayload.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate a unique job ID based on the job data
    const jobId = `${source}_${job.title}_${job.company}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // Save the job to the database
    // upsert: true means if it exists, update it (though we have no fields to update really), otherwise insert
    // But since we want to catch duplicates or just succeed, simple create is fine, but checking existance is better for idempotency if needed.
    // The previous code returned "Job already saved" on duplicate. 

    const existingJob = await Job.findOne({ user_id: userId, job_id: jobId, source });

    if (existingJob) {
      return NextResponse.json({ message: 'Job already saved' });
    }

    const newJob = await Job.create({
      user_id: userId,
      job_id: jobId,
      job_snapshot: job,
      source: source,
      title: job.title || 'Unknown Title',
      company: job.company || 'Unknown Company',
      location: job.location || '',
      description: job.description || '',
      apply_url: job.apply_url || '',
      salary: job.salary_range ? `${job.salary_range.min}-${job.salary_range.max}` : undefined
    });

    return NextResponse.json({ message: 'Job saved successfully', data: newJob });

  } catch (error) {
    console.error('Error saving job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
