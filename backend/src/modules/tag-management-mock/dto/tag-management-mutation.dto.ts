/**
 * 标签管理 Mock 写接口 DTO。
 * 这里按最新接口文档做严格转换和校验，防止空编码、非法枚举或缺少驳回原因的请求假成功。
 */
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

const strictNumber = ({ value }: TransformFnParams) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim().length === 0) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};

const validateIfDefined = (_object: object, value: unknown) => value !== undefined;

function IsNonEmptyCodeList(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isNonEmptyCodeList',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' && value.split(/[,，]/).some((code) => code.trim().length > 0)
          );
        },
        defaultMessage() {
          return '$property must contain at least one code';
        },
      },
    });
  };
}

/** 驳回状态 22 必须携带非空原因，其他审核状态允许省略。 */
function IsAuditResult(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isAuditResult',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown, { object }: ValidationArguments) {
          const status = (object as { status?: number }).status;
          if (value === undefined) return status !== 22;
          if (typeof value !== 'string') return false;
          return status !== 22 || value.trim().length > 0;
        },
        defaultMessage() {
          return '$property must be a string and is required when status is 22';
        },
      },
    });
  };
}

export class DictionaryRequestDto {
  @Transform(trimString)
  @IsString()
  @IsIn(['search', 'edit'])
  level!: 'search' | 'edit';
}

/** 新增和编辑标签共享的文档字段，具体必填项由子 DTO 补充。 */
class LabelMutationFieldsDto {
  @ValidateIf(validateIfDefined)
  @IsString()
  categorys?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  createRole?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  desc?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  labelEnName?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  labelalias?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  labelname?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([0, 1, 2, 3])
  labeltype?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  period?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  personDeal?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  personInput?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  personOutput?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  resource?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([14, 15, 16])
  shareAttr?: number;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  state?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  version?: string;
}

export class AddLabelDto extends LabelMutationFieldsDto {
  @Transform(trimString)
  @ValidateIf(validateIfDefined)
  @IsString()
  @IsNotEmpty()
  labelcode?: string;
}

export class EditLabelDto extends LabelMutationFieldsDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  labelcode!: string;
}

export class UpdateCategoryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  desc?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  filter?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  name?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  registerItem?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  registerRequired?: string;
}

export class LabelInfoSearchDto {
  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([0, 1])
  categoryRecursion?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  categorys?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  labelType?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  nowPage?: number;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  roleCodes?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([-1, 0, 1])
  roleFilterType?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  searchKey?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  shareType?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  state?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  viewCode?: string;
}

export class LabelCodeQueryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  labelCode!: string;
}

export class ParentIdQueryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  parentId!: string;
}

export class AuditListDto {
  @ValidateIf(validateIfDefined)
  @IsString()
  labelStatus?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  nowPage?: number;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  searchWord?: string;
}

export class LoginAccountDto {
  @ValidateIf(validateIfDefined)
  @IsString()
  loginName?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  password?: string;
}

export class ResultSearchDto {
  @ValidateIf(validateIfDefined)
  @IsString()
  attrValue?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  nowPage?: number;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  roleCode?: string;
}

export class PaginationQueryDto {
  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  nowPage?: number;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class DataResourceQueryDto {
  @ValidateIf(validateIfDefined)
  @IsString()
  searchKey?: string;
}

export class CategoryMutationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  cateCode!: string;

  @IsNonEmptyCodeList()
  labelCodes!: string;
}

export class AuthorityMutationDto {
  @IsNonEmptyCodeList()
  labelCodes!: string;

  @IsNonEmptyCodeList()
  roleCodes!: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(0)
  validUntil?: number;

  @ValidateIf(validateIfDefined)
  @IsString()
  viewCode?: string;
}

export class AuditReviewDto {
  @IsNonEmptyCodeList()
  auditIds!: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  bcontent?: string;

  @Transform(trimString)
  @IsAuditResult()
  result?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([21, 22])
  status?: number;
}

export class MyApplyReviewDto {
  @IsNonEmptyCodeList()
  auditIds!: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  bcontent?: string;

  @ValidateIf(validateIfDefined)
  @IsString()
  result?: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([23])
  status?: number;
}

export class ApplyLabelPermissionDto {
  @IsNonEmptyCodeList()
  labelCodes!: string;

  @IsNonEmptyCodeList()
  roleCodes!: string;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @IsIn([0, 1])
  vaild?: number;

  @ValidateIf(validateIfDefined)
  @Transform(strictNumber)
  @IsInt()
  @Min(0)
  validUntil?: number;
}
