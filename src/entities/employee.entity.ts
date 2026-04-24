import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { LeaveBalance } from './leave-balance.entity';
import { TimeOffRequest } from './time-off-request.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  externalHcmEmployeeId: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: 'ACTIVE' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => LeaveBalance, (lb) => lb.employee)
  leaveBalances: LeaveBalance[];

  @OneToMany(() => TimeOffRequest, (tor) => tor.employee)
  timeOffRequests: TimeOffRequest[];
}
