/**
 * 标签管理 Mock HTTP 适配层。
 * 路由、请求方法和 DTO 均与《服务文档新.md》一致，不提供已废弃兼容接口。
 */
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  AddLabelDto,
  ApplyLabelPermissionDto,
  AuditReviewDto,
  AuthorityMutationDto,
  CategoryMutationDto,
  DataResourceQueryDto,
  DictionaryRequestDto,
  EditLabelDto,
  AuditListDto,
  LabelCodeQueryDto,
  LabelInfoSearchDto,
  LoginAccountDto,
  MyApplyReviewDto,
  PaginationQueryDto,
  ParentIdQueryDto,
  ResultSearchDto,
  UpdateCategoryDto,
} from '../../dto/tag-management-mutation.dto';
import { TagManagementMockService } from '../../tag-management-mock.service';

@Controller()
export class TagManagementMockController {
  constructor(private readonly tagManagementMockService: TagManagementMockService) {}

  @Post('sys/dic/info')
  dictionary(@Body() body: DictionaryRequestDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.dictionary(body));
  }

  @Get('label/dic/info/search')
  labelSearchDictionary(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.labelSearchDictionary());
  }

  @Get('label/dic/info/edit')
  labelEditDictionary(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.labelEditDictionary());
  }

  @Get('labelCategory/parentCategoryInfo')
  parentCategoryInfo(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.parentCategoryInfo());
  }

  @Get('labelCategory/childCategoryInfo')
  childCategoryInfo(@Query() query: ParentIdQueryDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.childCategoryInfo(query.parentId));
  }

  @Get('labelCategory/labelCategoryInfo')
  labelCategoryInfo(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.labelCategoryInfo());
  }

  @Get('labelCategory/categoryChildsInfo')
  categoryChildsInfo(@Query() query: ParentIdQueryDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.categoryChildsInfo(query.parentId));
  }

  @Post('labelCategory/updateCategory')
  updateCategory(@Body() body: UpdateCategoryDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.updateCategory(body));
  }

  @Post('labelCategory/connect')
  connectCategory(@Body() body: CategoryMutationDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.connectCategory(body));
  }

  @Post('labelCategory/disConnect')
  disconnectCategory(@Body() body: CategoryMutationDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.disconnectCategory(body));
  }

  @Post('labelCategory/labelinfo')
  categoryLabelInfo(@Body() body: LabelInfoSearchDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.categoryLabelInfo(body));
  }

  @Get('authority/list')
  authorityList(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.authorityRoleList());
  }

  @Get('authority/parentCategoryInfo')
  authorityParentCategoryInfo(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.authorityParentCategoryInfo());
  }

  @Get('authority/childCategoryInfo')
  authorityChildCategoryInfo(@Query() query: ParentIdQueryDto, @Res() response: Response) {
    return this.success(
      response,
      this.tagManagementMockService.authorityChildCategoryInfo(query.parentId),
    );
  }

  @Post('authority/labelinfo')
  authorityLabelInfo(@Body() body: LabelInfoSearchDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.authorityLabelInfo(body));
  }

  @Post('authority/add/byLabelCode')
  addAuthority(@Body() body: AuthorityMutationDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.addAuthority(body));
  }

  @Post('authority/delete/byLabelCode')
  deleteAuthority(@Body() body: AuthorityMutationDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.deleteAuthority(body));
  }

  @Post('label/applyLabel')
  applyLabelPermission(@Body() body: ApplyLabelPermissionDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.applyLabelPermission(body));
  }

  @Get('label/applyStateSs')
  applyStateSs(@Query() query: LabelCodeQueryDto, @Res() response: Response) {
    return this.mutationResult(
      response,
      this.tagManagementMockService.applyStateSs(query.labelCode),
    );
  }

  @Get('label/delLabel')
  delLabel(@Query() query: LabelCodeQueryDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.delLabel(query.labelCode));
  }

  @Get('label/detail')
  labelDetail(@Query() query: LabelCodeQueryDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.labelDetail(query.labelCode));
  }

  @Post('label/editLabel')
  editLabel(@Body() body: EditLabelDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.editLabel(body));
  }

  @Get('label/onlineLabel')
  onlineLabel(@Query() query: LabelCodeQueryDto, @Res() response: Response) {
    return this.mutationResult(
      response,
      this.tagManagementMockService.onlineLabel(query.labelCode),
    );
  }

  @Get('label/offlineLabel')
  offlineLabel(@Query() query: LabelCodeQueryDto, @Res() response: Response) {
    return this.mutationResult(
      response,
      this.tagManagementMockService.offlineLabel(query.labelCode),
    );
  }

  @Get('label/suspendLabel')
  suspendLabel(@Query() query: LabelCodeQueryDto, @Res() response: Response) {
    return this.mutationResult(
      response,
      this.tagManagementMockService.suspendLabel(query.labelCode),
    );
  }

  @Post('audit/auditInfos')
  auditInfos(@Body() body: AuditListDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.auditInfos(body));
  }

  @Post('audit/reviewInfos')
  reviewInfos(@Body() body: AuditListDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.reviewInfos(body));
  }

  @Post('audit/auditReview')
  auditReview(@Body() body: AuditReviewDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.auditReview(body));
  }

  @Post('audit/myApplyReview')
  myApplyReview(@Body() body: MyApplyReviewDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.myApplyReview(body));
  }

  @Post('label/addLabel')
  addLabel(@Body() body: AddLabelDto, @Res() response: Response) {
    return this.mutationResult(response, this.tagManagementMockService.addLabel(body));
  }

  @Post('label/labelinfo')
  labelInfo(@Body() body: LabelInfoSearchDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.labelInfo(body));
  }

  @Post('open/login/account')
  accountLogin(@Body() body: LoginAccountDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.accountLogin(body));
  }

  @Post('label/result/search')
  resultSearch(@Body() body: ResultSearchDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.resultSearch(body));
  }

  @Post('dataResource/list')
  dataResourceList(@Query() query: DataResourceQueryDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.dataResourceList(query.searchKey));
  }

  @Get('label/resultStatic/all')
  resultOverview(@Res() response: Response) {
    return this.success(response, this.tagManagementMockService.resultOverview());
  }

  @Post('label/resultStatic/labelCodeResult')
  labelCodeResult(@Query() query: PaginationQueryDto, @Res() response: Response) {
    return this.success(response, this.tagManagementMockService.labelCodeResult(query));
  }

  private success(response: Response, data: unknown, msg = '操作成功!') {
    return response.status(200).json({
      code: 200,
      data,
      msg,
    });
  }

  private mutationResult(response: Response, succeeded: boolean) {
    if (succeeded) return this.success(response, true);
    return response.status(400).json({
      code: -200,
      data: false,
      msg: '操作失败!',
    });
  }
}
