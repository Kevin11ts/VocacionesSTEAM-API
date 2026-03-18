import { Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { Response } from 'express';

@Catch()
export class RpcToHttpExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Extraer el mensaje de error
    let message = 'Internal server error';
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      message = typeof rpcError === 'string' ? rpcError : (rpcError as any)?.message ?? message;
    } else if (exception?.message) {
      message = exception.message;
    }

    // Mapear mensajes conocidos a códigos HTTP apropiados
    const errorMap: Record<string, number> = {
      'Email already in use': HttpStatus.CONFLICT,
      'Invalid OTP code': HttpStatus.BAD_REQUEST,
      'OTP expired': HttpStatus.BAD_REQUEST,
      'User not found': HttpStatus.NOT_FOUND,
      'Invalid credentials': HttpStatus.UNAUTHORIZED,
      'Email is not verified': HttpStatus.FORBIDDEN,
      'Unauthorized': HttpStatus.UNAUTHORIZED,
    };

    statusCode = errorMap[message];

    // Mapeo dinámico para mensajes con variables
    if (!statusCode) {
      if (message.includes('locked') || message.includes('Too many failed attempts')) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      } else if (message.includes('Invalid OTP code')) {
        statusCode = HttpStatus.BAD_REQUEST;
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
      }
    }

    response.status(statusCode).json({
      statusCode,
      message,
    });
  }
}
