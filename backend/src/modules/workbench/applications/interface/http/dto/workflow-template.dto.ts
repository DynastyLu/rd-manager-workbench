import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class WorkflowTemplateNodeDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  code!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  prerequisiteNodeCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  requiredRequirementCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  requiredMaterialCodes?: string[];

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class CreateWorkflowTemplateDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  category?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTemplateNodeDto)
  nodes!: WorkflowTemplateNodeDto[];
}

export class UpdateWorkflowTemplateDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTemplateNodeDto)
  nodes?: WorkflowTemplateNodeDto[];
}

export class ListWorkflowTemplatesQueryDto {
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}
