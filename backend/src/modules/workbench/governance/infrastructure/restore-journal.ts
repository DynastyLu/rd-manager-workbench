import { BackupFilesystem } from './backup-filesystem';

export type RestoreJournalPhase =
  | 'PREPARED'
  | 'DATABASE_RESTORED'
  | 'FILES_SWAPPED'
  | 'VALIDATED'
  | 'ROLLED_BACK'
  | 'ROLLBACK_FAILED'
  | 'COMPLETED';

export class RestoreJournal {
  private current?: {
    jobId: string;
    targetBackupId: string;
    protectiveBackupId: string;
    phase: RestoreJournalPhase;
    updatedAt: string;
  };

  constructor(private readonly filesystem: BackupFilesystem) {}

  async begin(input: { jobId: string; targetBackupId: string; protectiveBackupId: string }) {
    this.current = {
      ...input,
      phase: 'PREPARED',
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
  }

  async mark(phase: RestoreJournalPhase) {
    if (!this.current) throw new Error('Restore journal has not started');
    this.current = { ...this.current, phase, updatedAt: new Date().toISOString() };
    await this.persist();
  }

  async complete() {
    await this.mark('COMPLETED');
  }

  private async persist() {
    if (!this.current) return;
    await this.filesystem.writeJsonAtomic(
      `restore-journal/${this.current.jobId}/journal.json`,
      this.current,
    );
  }
}
