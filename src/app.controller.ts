import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getApiInfo() {
    return {
      name: 'Time-Off Microservice API',
      version: '1.0.0',
      description: 'Backend API for managing time-off requests with HCM synchronization',
      endpoints: {
        balances: {
          'GET /balances/:employeeId': 'Get balance for employee (query: locationId, leaveType)',
          'POST /balances/sync/realtime': 'Sync balance from HCM (realtime)',
          'POST /balances/sync/batch': 'Batch import balances from HCM',
          'POST /balances/reconcile': 'Run reconciliation to detect/correct drift',
        },
        timeOffRequests: {
          'POST /time-off-requests': 'Create new time-off request',
          'GET /time-off-requests/:id': 'Get specific request',
          'GET /time-off-requests': 'List requests (query: employeeId, status)',
          'POST /time-off-requests/:id/approve': 'Approve request (triggers HCM sync)',
          'POST /time-off-requests/:id/reject': 'Reject request (releases pending units)',
          'POST /time-off-requests/:id/retry-sync': 'Retry failed sync',
          'GET /time-off-requests/sync-events/all': 'Get sync events (query: requestId, status)',
        },
        mockHcm: {
          'GET /mock-hcm/balances/:employeeId': 'Get HCM balance (query: locationId, leaveType)',
          'POST /mock-hcm/time-off/validate': 'Validate time-off with HCM',
          'POST /mock-hcm/time-off/apply': 'Apply time-off deduction in HCM',
          'POST /mock-hcm/balances/batch-export': 'Export all HCM balances',
          'POST /mock-hcm/balances/batch-import': 'Import balances to HCM',
          'POST /mock-hcm/config/failure': 'Configure HCM failure simulation',
          'POST /mock-hcm/reset': 'Reset mock HCM state',
        },
        reconciliation: {
          'POST /reconciliation/run': 'Run reconciliation process',
          'GET /reconciliation/runs': 'List reconciliation run history',
        },
      },
      testing: {
        unitTests: 'npm run test',
        e2eTests: 'npm run test:e2e',
        coverage: 'npm run test:cov',
      },
      documentation: 'See README.md for full TRD and architecture details',
    };
  }
}
