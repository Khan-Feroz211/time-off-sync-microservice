import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { TimeOffRequest } from './time-off-request.entity';

export enum SyncDirection {
  OUTBOUND = 'OUTBOUND',
  INBOUND = 'INBOUND',
}

export enum SyncEventType {
  REALTIME_VALIDATE = 'REALTIME_VALIDATE',
  REALTIME_APPLY = 'REALTIME_APPLY',
  BATCH_IMPORT = 'BATCH_IMPORT',
  RECONCILIATION = 'RECONCILIATION',
}

export enum SyncStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

@Entity('sync_events')
@Index(['requestId', 'status'])
export class SyncEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  requestId: string;

  @ManyToOne(() => TimeOffRequest, (tor) => tor.id, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requestId' })
  request: TimeOffRequest;

  @Column({ type: 'simple-enum', enum: SyncDirection })
  direction: SyncDirection;

  @Column({ type: 'simple-enum', enum: SyncEventType })
  eventType: SyncEventType;

  @Column({ type: 'simple-enum', enum: SyncStatus, default: SyncStatus.SUCCESS })
  status: SyncStatus;

  @Column({ nullable: true })
  payloadHash: string;

  @Column({ nullable: true })
  errorCode: string;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ default: 1 })
  attempt: number;

  @CreateDateColumn()
  createdAt: Date;
}
