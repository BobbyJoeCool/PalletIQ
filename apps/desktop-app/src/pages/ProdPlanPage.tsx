import { hasMinRole } from '@shared/roles';
import type { Role } from '@shared/roles';
import { DailyPlanSection } from '../components/prodPlan/DailyPlanSection';
import { ProdGoalSection } from '../components/prodPlan/ProdGoalSection';
import { RampingSection } from '../components/prodPlan/RampingSection';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useAuth } from '../context/authContext';

/**
 * Prod Goal / Ramping / Daily Plan (#146). LWW, OM and Admin can open it and edit
 * ramping and Daily Plan targets for their department; only OM and Admin change prod goal
 * rates (global, with dated history). ICQA is excluded unless they hold one of those roles.
 */
export function ProdPlanPage() {
  const { user } = useAuth();
  const role = (user?.role ?? 'WORKER') as Role;

  if (!hasMinRole(role, 'LEAD')) {
    return (
      <ErrorBanner message="Prod Goal / Ramping / Daily Plan is limited to LWW, OM and System Admin." />
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <h1 className="text-2xl font-semibold">Prod Goal / Ramping / Daily Plan</h1>
      <DailyPlanSection />
      <RampingSection />
      <ProdGoalSection canEdit={hasMinRole(role, 'MANAGER')} />
    </div>
  );
}
