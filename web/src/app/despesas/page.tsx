import { verifySession } from '@/lib/dal'
import ExpenseClient from './ExpenseClient'
import './expenses.css'
export const dynamic='force-dynamic'
export default async function DespesasPage(){await verifySession();return <ExpenseClient/>}
