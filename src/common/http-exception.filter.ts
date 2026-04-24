import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: any;
    if (typeof exceptionResponse === 'string') {
      message = { message: exceptionResponse };
    } else if (typeof exceptionResponse === 'object') {
      message = exceptionResponse;
    } else {
      message = { message: exceptionResponse };
    }

    response.status(status).json({
      statusCode: status,
      message: message,
    });
  }
}
