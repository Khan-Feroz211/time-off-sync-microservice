import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Employee } from './employee.entity';
import { Location } from './location.entity';

export enum RequestStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING_MANAGER_APPROVAL = 'PENDING_MANAGER_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SYNCED = 'SYNCED',
  SYNC_FAILED = 'SYNC_FAILED',
  RETRYING = 'RETRYING',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

@Entity('time_off_requests')
@Index(['employeeId', 'status'])
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @ManyToOne(() => Employee, (e) => e.timeOffRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  locationId: string;

  @ManyToOne(() => Location, (l) => l.timeOffRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column()
  leaveType: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  units: number;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({
    type: 'simple-enum',
    enum: RequestStatus,
    default: RequestStatus.DRAFT,
  })
  status: RequestStatus;

  @Column({ type: 'varchar', nullable: true })
  managerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  hcmReference: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
