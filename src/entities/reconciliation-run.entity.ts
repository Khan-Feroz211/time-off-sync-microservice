import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReconciliationStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('reconciliation_runs')
export class ReconciliationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date;

  @Column({ type: 'simple-enum', enum: ReconciliationStatus, default: ReconciliationStatus.RUNNING })
  status: ReconciliationStatus;

  @Column({ default: 0 })
  recordsScanned: number;

  @Column({ default: 0 })
  driftCount: number;

  @Column({ type: 'text', nullable: true })
  actionSummary: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
