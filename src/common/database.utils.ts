import { Logger } from '@nestjs/common';

/**
 * Database-agnostic utility for handling unique constraint violations
 * Works with MySQL, PostgreSQL, and SQLite
 */
export class DatabaseUtils {
  private static readonly logger = new Logger(DatabaseUtils.name);

  /**
   * Detects if an error is a unique constraint violation
   * Supports MySQL, PostgreSQL, and SQLite
   */
  static isUniqueConstraintViolation(error: any): boolean {
    if (!error) return false;
    
    const errorCode = error.code || error.errno || '';
    const errorMessage = (error.message || '').toLowerCase();
    const errorDetail = (error.detail || '').toLowerCase();

    // MySQL error codes
    if (errorCode === 'ER_DUP_ENTRY' || errorCode === 1062) {
      return true;
    }

    // PostgreSQL error codes
    if (errorCode === '23505' || errorCode === 'UNIQUE_VIOLATION') {
      return true;
    }

    // SQLite error codes
    if (errorCode === 'SQLITE_CONSTRAINT' || errorCode === 'UNIQUE constraint failed') {
      return true;
    }

    // Message-based detection for edge cases
    if (errorMessage.includes('unique constraint') ||
        errorMessage.includes('duplicate entry') ||
        errorMessage.includes('duplicate key') ||
        errorMessage.includes('unique violation') ||
        errorDetail.includes('unique') ||
        errorDetail.includes('duplicate')) {
      return true;
    }

    return false;
  }

  /**
   * Extracts the field name from a unique constraint violation error
   */
  static getConstraintFieldName(error: any): string | null {
    const errorMessage = error.message || '';
    
    // MySQL: "Duplicate entry '...' for key 'fieldName'"
    const mysqlMatch = errorMessage.match(/for key '([^']+)'/);
    if (mysqlMatch) return mysqlMatch[1];

    // PostgreSQL: "duplicate key value violates unique constraint \"idx_...\" (DETAIL: Key (fieldName)=..."
    const postgresMatch = errorMessage.match(/Key \(([^)]+)\)/);
    if (postgresMatch) return postgresMatch[1];

    // SQLite: "UNIQUE constraint failed: tableName.fieldName"
    const sqliteMatch = errorMessage.match(/UNIQUE constraint failed: .*\.([^\s]+)/);
    if (sqliteMatch) return sqliteMatch[1];

    return null;
  }

  /**
   * Logs a unique constraint violation with context
   */
  static logUniqueConstraintViolation(error: any, context: string): void {
    const fieldName = this.getConstraintFieldName(error);
    this.logger.warn(
      `Unique constraint violation in ${context}${fieldName ? ` (field: ${fieldName})` : ''}. ` +
      `Error: ${error.message}. Attempting recovery...` 
    );
  }

  /**
   * Provides a user-friendly error message for unique constraint violations
   */
  static getUserFriendlyMessage(error: any, entityName: string): string {
    const fieldName = this.getConstraintFieldName(error);
    if (fieldName) {
      return `A ${entityName} with this ${fieldName} already exists`;
    }
    return `Duplicate ${entityName} entry detected`;
  }
}
