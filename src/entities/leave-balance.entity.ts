import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index, VersionColumn } from 'typeorm';
import { Employee } from './employee.entity';
import { Location } from './location.entity';

@Entity('leave_balances')
@Index(['employeeId', 'locationId', 'leaveType'], { unique: true })
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @ManyToOne(() => Employee, (e) => e.leaveBalances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  locationId: string;

  @ManyToOne(() => Location, (l) => l.leaveBalances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @Column()
  leaveType: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  availableUnits: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pendingUnits: number;

  @Column({ type: 'datetime', nullable: true })
  lastHcmSnapshotAt: Date;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
