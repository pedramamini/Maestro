import { memo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Circle, Gauge } from 'lucide-react';
import type { Theme } from '../../types';
import type { MaestroProjectHealthMetric } from './types';

export interface ProjectHealthStripProps {
	theme: Theme;
	metrics: MaestroProjectHealthMetric[];
	title?: string;
}

function metricTone(metric: MaestroProjectHealthMetric, theme: Theme): string {
	switch (metric.tone) {
		case 'good':
			return theme.colors.success;
		case 'warning':
			return theme.colors.warning;
		case 'danger':
			return theme.colors.error;
		case 'neutral':
		default:
			return theme.colors.accent;
	}
}

function MetricIcon({ tone, color }: { tone: MaestroProjectHealthMetric['tone']; color: string }) {
	if (tone === 'good') return <CheckCircle2 className="h-4 w-4" style={{ color }} />;
	if (tone === 'warning' || tone === 'danger') {
		return <AlertTriangle className="h-4 w-4" style={{ color }} />;
	}
	return <Circle className="h-4 w-4" style={{ color }} />;
}

export const ProjectHealthStrip = memo(function ProjectHealthStrip({
	theme,
	metrics,
	title = 'Project Health',
}: ProjectHealthStripProps) {
	return (
		<section
			className="border-b px-4 py-3"
			style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
			aria-label={title}
		>
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex min-w-[150px] items-center gap-2">
					<Gauge className="h-4 w-4" style={{ color: theme.colors.accent }} />
					<h2 className="text-sm font-semibold" style={{ color: theme.colors.textMain }}>
						{title}
					</h2>
				</div>
				{metrics.length === 0 ? (
					<span
						className="inline-flex items-center gap-2 text-xs"
						style={{ color: theme.colors.textDim }}
					>
						<Activity className="h-4 w-4" />
						No metrics
					</span>
				) : (
					metrics.map((metric) => {
						const color = metricTone(metric, theme);
						return (
							<div
								key={metric.id}
								className="flex min-w-[118px] items-center gap-2 rounded border px-2.5 py-2"
								style={{
									backgroundColor: theme.colors.bgActivity,
									borderColor: theme.colors.border,
								}}
							>
								<MetricIcon tone={metric.tone} color={color} />
								<div className="min-w-0">
									<div className="text-sm font-bold leading-tight" style={{ color }}>
										{metric.value}
									</div>
									<div
										className="truncate text-[10px] font-medium"
										style={{ color: theme.colors.textDim }}
									>
										{metric.label}
									</div>
									{metric.detail && (
										<div className="truncate text-[10px]" style={{ color: theme.colors.textDim }}>
											{metric.detail}
										</div>
									)}
								</div>
							</div>
						);
					})
				)}
			</div>
		</section>
	);
});
