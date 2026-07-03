import {
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { Response } from 'express';

@Catch()
export class RpcToHttpExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Extraer el mensaje de error
    let message = 'Error interno del servidor';
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      // Las HttpException ya traen su código correcto (401 Unauthorized,
      // 403 Forbidden, 404, etc.). Respetarlo es crítico: el frontend
      // dispara el refresh silencioso de sesión SOLO ante un 401 real.
      const httpRes = exception.getResponse() as any;
      statusCode = exception.getStatus();
      message = httpRes?.message || exception.message;
      return response.status(statusCode).json({ statusCode, message });
    }

    if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      message =
        typeof rpcError === 'string'
          ? rpcError
          : ((rpcError as any)?.message ?? message);
    } else if (exception?.message) {
      message = exception.message;
    }

    if (Array.isArray(message)) {
      return response.status(statusCode).json({
        statusCode,
        message,
      });
    }

    // Mapear mensajes conocidos (de los microservicios) a códigos HTTP
    const errorMap: Record<string, number> = {
      'El correo electrónico ya está en uso': HttpStatus.CONFLICT,
      'Código inválido': HttpStatus.BAD_REQUEST,
      'El código ha expirado': HttpStatus.BAD_REQUEST,
      'Usuario no encontrado': HttpStatus.NOT_FOUND,
      'User not found': HttpStatus.NOT_FOUND,
      'Test not found': HttpStatus.NOT_FOUND,
      'Simulator not found': HttpStatus.NOT_FOUND,
      'Question not found': HttpStatus.NOT_FOUND,
      'Saved university not found': HttpStatus.NOT_FOUND,
      'University already saved': HttpStatus.CONFLICT,
      'Credenciales inválidas': HttpStatus.UNAUTHORIZED,
      'El correo no está verificado': HttpStatus.FORBIDDEN,
      'No autorizado': HttpStatus.UNAUTHORIZED,
      Unauthorized: HttpStatus.UNAUTHORIZED,
    };

    statusCode = errorMap[message];

    // Mapeo dinámico para mensajes con variables
    if (!statusCode) {
      if (
        message.includes('bloqueada') ||
        message.includes('Demasiados intentos fallidos')
      ) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      } else if (message.includes('Código inválido')) {
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
