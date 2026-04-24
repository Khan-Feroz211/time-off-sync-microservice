import { Repository } from 'typeorm';
import { Employee } from '../../src/entities/employee.entity';
import { Location } from '../../src/entities/location.entity';

export async function seedEmployeeAndLocation(
  employeeRepo: Repository<Employee>,
  locationRepo: Repository<Location>,
  employeeId = 'emp-001',
  locationId = 'loc-001',
) {
  let employee = await employeeRepo.findOne({ where: { externalHcmEmployeeId: employeeId } });
  if (!employee) {
    employee = employeeRepo.create({
      externalHcmEmployeeId: employeeId,
      firstName: 'Test',
      lastName: 'User',
      status: 'ACTIVE',
    });
    employee = await employeeRepo.save(employee);
  }

  let location = await locationRepo.findOne({ where: { externalHcmLocationId: locationId } });
  if (!location) {
    location = locationRepo.create({
      externalHcmLocationId: locationId,
      name: 'HQ',
      countryCode: 'US',
    });
    location = await locationRepo.save(location);
  }

  return { employee, location };
}
