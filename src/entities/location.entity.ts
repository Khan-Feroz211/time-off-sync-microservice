import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { LeaveBalance } from './leave-balance.entity';
import { TimeOffRequest } from './time-off-request.entity';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  externalHcmLocationId: string;

  @Column()
  name: string;

  @Column()
  countryCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => LeaveBalance, (lb) => lb.location)
  leaveBalances: LeaveBalance[];

  @OneToMany(() => TimeOffRequest, (tor) => tor.location)
  timeOffRequests: TimeOffRequest[];
}
