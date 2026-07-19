import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSupportTicketDto {
  @ApiProperty({ enum: ['bug', 'account', 'suggestion', 'other'] })
  @IsIn(['bug', 'account', 'suggestion', 'other'])
  category: string;

  @ApiProperty({ minLength: 5, maxLength: 140 })
  @IsString()
  @MinLength(5)
  @MaxLength(140)
  subject: string;

  @ApiProperty({ minLength: 20, maxLength: 5000 })
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  message: string;
}

export class UpdateSupportTicketDto {
  @ApiProperty({
    required: false,
    enum: ['open', 'in_review', 'resolved', 'closed'],
  })
  @IsOptional()
  @IsIn(['open', 'in_review', 'resolved', 'closed'])
  status?: string;

  @ApiProperty({ required: false, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  reply?: string;
}

export class RegisterPushSubscriptionDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  endpoint: string;

  @ApiProperty({ example: { p256dh: '...', auth: '...' } })
  @IsObject()
  keys: { p256dh: string; auth: string };

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;
}

export class SendNotificationCampaignDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^(\/(?!\/)|https:\/\/)/, {
    message: 'url debe ser una ruta interna o una URL HTTPS',
  })
  @MaxLength(500)
  url?: string;

  @ApiProperty({ enum: ['new_careers', 'marketing', 'community', 'service'] })
  @IsIn(['new_careers', 'marketing', 'community', 'service'])
  category: string;

  @ApiProperty({ type: [String], enum: ['push', 'email'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['push', 'email'], { each: true })
  channels: string[];
}

export class DeleteOwnAccountDto {
  @ApiProperty({ example: 'ELIMINAR' })
  @IsIn(['ELIMINAR'])
  confirmation: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;
}
