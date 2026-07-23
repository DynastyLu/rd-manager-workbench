import { type ReactNode } from 'react'
import { Button } from '@/components/workspace/SemiCompat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/workspace/SemiCompat'
import { Skeleton } from '@/components/workspace/SemiCompat'

export function ManagementLoading({ label }: { label: string }) { return <Card aria-busy="true"><CardContent className="grid gap-3 pt-4"><Skeleton className="h-9 w-full"/><Skeleton className="h-9 w-full"/><p className="sr-only">正在加载{label}</p></CardContent></Card> }
export function ManagementError({ label, retry }: { label:string; retry:()=>void }) { return <Card><CardHeader><CardTitle>无法读取{label}</CardTitle><CardDescription>请确认本地服务已启动后重试。</CardDescription></CardHeader><CardContent><Button onClick={retry}>重试</Button></CardContent></Card> }
export function ManagementEmpty({ label, action }: { label:string; action?:ReactNode }) { return <Card><CardHeader><CardTitle>还没有{label}</CardTitle><CardDescription>先创建一条记录，后续可在详情中关联任务和时间线。</CardDescription></CardHeader>{action?<CardContent>{action}</CardContent>:null}</Card> }
