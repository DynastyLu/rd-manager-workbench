import { request } from '@/lib/http'
import type { CommunicationRecord, Decision, Issue, Meeting, MeetingAction, Paginated, Partner, PartnerAgreement, PartnerContact, Risk, WorkTask } from '../types'

type Params = Record<string, string | number | boolean | undefined>
const query = (params: Params = {}) => { const value = new URLSearchParams(); Object.entries(params).forEach(([key, item]) => { if (item !== undefined) value.set(key, String(item)) }); const rendered=value.toString(); return rendered ? `?${rendered}` : '' }
const child = (parent:string, id:string) => `${parent}/${encodeURIComponent(id)}`
export type CreateSourceTaskInput = { title:string; description?:string; projectId?:string; assigneeName?:string; dueAt?:string; priority?:string }
export const listRisks=(p:Params={})=>request<Paginated<Risk>>(`/risks${query(p)}`); export const getRisk=(id:string)=>request<Risk>(child('/risks',id)); export const createRisk=(input:Partial<Risk>&{title:string;likelihood:string;impact:string;level:string})=>request<Risk>('/risks',{method:'POST',body:JSON.stringify(input)}); export const updateRisk=(id:string,input:Partial<Risk>)=>request<Risk>(child('/risks',id),{method:'PATCH',body:JSON.stringify(input)}); export const archiveRisk=(id:string)=>request<void>(child('/risks',id),{method:'DELETE'});
export const listIssues=(p:Params={})=>request<Paginated<Issue>>(`/issues${query(p)}`); export const createIssue=(input:Partial<Issue>&{title:string})=>request<Issue>('/issues',{method:'POST',body:JSON.stringify(input)}); export const updateIssue=(id:string,input:Partial<Issue>)=>request<Issue>(child('/issues',id),{method:'PATCH',body:JSON.stringify(input)}); export const archiveIssue=(id:string)=>request<void>(child('/issues',id),{method:'DELETE'});
export const listDecisions=(p:Params={})=>request<Paginated<Decision>>(`/decisions${query(p)}`); export const getDecision=(id:string)=>request<Decision>(child('/decisions',id)); export const createDecision=(input:Partial<Decision>&{title:string;alternatives:string[]})=>request<Decision>('/decisions',{method:'POST',body:JSON.stringify(input)}); export const updateDecision=(id:string,input:Partial<Decision>)=>request<Decision>(child('/decisions',id),{method:'PATCH',body:JSON.stringify(input)}); export const archiveDecision=(id:string)=>request<void>(child('/decisions',id),{method:'DELETE'}); export const createDecisionTask=(id:string,input:CreateSourceTaskInput)=>request<WorkTask>(`${child('/decisions',id)}/task`,{method:'POST',body:JSON.stringify(input)});
export const listPartners=(p:Params={})=>request<Paginated<Partner>>(`/partners${query(p)}`); export const getPartner=(id:string)=>request<Partner>(child('/partners',id)); export const createPartner=(input:Pick<Partner,'name'>&Partial<Partner>)=>request<Partner>('/partners',{method:'POST',body:JSON.stringify(input)}); export const updatePartner=(id:string,input:Partial<Partner>)=>request<Partner>(child('/partners',id),{method:'PATCH',body:JSON.stringify(input)}); export const archivePartner=(id:string)=>request<void>(child('/partners',id),{method:'DELETE'});
export const createContact=(partnerId:string,input:Partial<PartnerContact>&{name:string})=>request<PartnerContact>(`${child('/partners',partnerId)}/contacts`,{method:'POST',body:JSON.stringify(input)}); export const createAgreement=(partnerId:string,input:Partial<PartnerAgreement>&{title:string})=>request<PartnerAgreement>(`${child('/partners',partnerId)}/agreements`,{method:'POST',body:JSON.stringify(input)}); export const listCommunications=(partnerId:string,p:Params={})=>request<Paginated<CommunicationRecord>>(`${child('/partners',partnerId)}/communications${query(p)}`); export const createCommunication=(partnerId:string,input:Partial<CommunicationRecord>&{type:string;occurredAt:string;subject:string})=>request<CommunicationRecord>(`${child('/partners',partnerId)}/communications`,{method:'POST',body:JSON.stringify(input)}); export const createCommunicationTask=(id:string,input:CreateSourceTaskInput)=>request<WorkTask>(`${child('/communications',id)}/task`,{method:'POST',body:JSON.stringify(input)});
export interface MeetingMinutesDocument {
  id: string
  title: string
  type: 'MEETING_MINUTES'
  plainText?: string | null
  content?: unknown
}

export interface MeetingActionTaskResult {
  task: WorkTask
  alreadyExists: boolean
}

export const listMeetings = (params: Params = {}) =>
  request<Paginated<Meeting>>(`/meetings${query(params)}`)
export const getMeeting = (id: string) => request<Meeting>(child('/meetings', id))
export const createMeeting = (input: Partial<Meeting> & { title: string; scheduledAt: string }) =>
  request<Meeting>('/meetings', { method: 'POST', body: JSON.stringify(input) })
export const updateMeeting = (id: string, input: Partial<Meeting>) =>
  request<Meeting>(child('/meetings', id), { method: 'PATCH', body: JSON.stringify(input) })
export const archiveMeeting = (id: string) =>
  request<void>(child('/meetings', id), { method: 'DELETE' })
export const createMeetingAgendaItem = (
  id: string,
  input: { title: string; description?: string; sequence?: number },
) =>
  request(`${child('/meetings', id)}/agenda-items`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const createMeetingAction = (
  id: string,
  input: Partial<MeetingAction> & { title: string },
) =>
  request<MeetingAction>(`${child('/meetings', id)}/actions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const updateMeetingAction = (
  meetingId: string,
  id: string,
  input: Partial<MeetingAction>,
) =>
  request<MeetingAction>(`${child('/meetings', meetingId)}/actions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
export const createMeetingActionTask = (id: string, input: CreateSourceTaskInput) =>
  request<MeetingActionTaskResult>(`${child('/meeting-actions', id)}/task`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
export const createMeetingMinutesDocument = (id: string) =>
  request<MeetingMinutesDocument>(`${child('/meetings', id)}/minutes-document`, {
    method: 'POST',
  })
