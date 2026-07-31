import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnalyzeOwnershipMigrationDto {
  @IsOptional()
  @IsString()
  @Length(0, 512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  batchSize = 100;
}

export class ApplyOwnershipMigrationDto {
  @IsString()
  @Length(1, 256)
  idempotencyKey!: string;
}

export class ListUnresolvedOwnershipMigrationDto {
  @IsOptional()
  @IsString()
  @Length(0, 512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  batchSize = 100;
}

class BulkOwnershipAssignmentDto {
  @IsString()
  @Length(1, 128)
  recordType!: string;

  @IsString()
  @Length(1, 128)
  recordId!: string;

  @IsString()
  @Length(1, 128)
  ownerUserId!: string;
}

export class BulkAssignOwnershipDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkOwnershipAssignmentDto)
  assignments!: BulkOwnershipAssignmentDto[];
}
