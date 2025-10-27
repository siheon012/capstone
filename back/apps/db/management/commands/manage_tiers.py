"""
데이터 계층 관리 명령어
"""
from django.core.management.base import BaseCommand
from apps.db.tier_manager import get_tier_manager

class Command(BaseCommand):
    help = 'Manage data tiers (Hot/Warm/Cold)'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'action',
            choices=['analyze', 'migrate', 'status'],
            help='Action to perform'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without actually doing it'
        )
    
    def handle(self, *args, **options):
        tier_manager = get_tier_manager()
        action = options['action']
        dry_run = options['dry_run']
        
        if action == 'analyze':
            self.analyze_temperatures(tier_manager)
        elif action == 'migrate':
            self.migrate_data(tier_manager, dry_run)
        elif action == 'status':
            self.show_status(tier_manager)
    
    def analyze_temperatures(self, tier_manager):
        """데이터 온도 분석"""
        self.stdout.write("Analyzing data temperatures...")
        
        stats = tier_manager.analyze_data_temperature()
        
        self.stdout.write(f"\n📊 Data Temperature Analysis:")
        self.stdout.write(f"🔥 Hot: {len(stats['hot'])} items")
        self.stdout.write(f"🌤️  Warm: {len(stats['warm'])} items") 
        self.stdout.write(f"❄️  Cold: {len(stats['cold'])} items")
        
        self.stdout.write(f"\n🔄 Migration Needed:")
        self.stdout.write(f"⬆️  Needs Promotion: {len(stats['needs_promotion'])} items")
        self.stdout.write(f"⬇️  Needs Demotion: {len(stats['needs_demotion'])} items")
        
        # 상세 정보
        if stats['needs_promotion']:
            self.stdout.write(f"\n⬆️  Items needing promotion to Hot:")
            for analysis in stats['needs_promotion'][:5]:  # 처음 5개만
                self.stdout.write(f"   - Analysis {analysis.id}: hotness={analysis.hotness_score:.1f}, tier={analysis.storage_tier}")
        
        if stats['needs_demotion']:
            self.stdout.write(f"\n⬇️  Items needing demotion:")
            for analysis in stats['needs_demotion'][:5]:  # 처음 5개만
                self.stdout.write(f"   - Analysis {analysis.id}: hotness={analysis.hotness_score:.1f}, tier={analysis.storage_tier}")
    
    def migrate_data(self, tier_manager, dry_run):
        """데이터 마이그레이션 실행"""
        if dry_run:
            self.stdout.write("🧪 DRY RUN MODE - No actual changes will be made")
        
        self.stdout.write("Starting data tier migration...")
        
        if dry_run:
            # 시뮬레이션만
            stats = tier_manager.analyze_data_temperature()
            self.stdout.write(f"Would promote {len(stats['needs_promotion'])} items")
            self.stdout.write(f"Would demote {len(stats['needs_demotion'])} items")
        else:
            # 실제 실행
            result = tier_manager.run_daily_tier_management()
            
            self.stdout.write(f"\n✅ Migration completed:")
            self.stdout.write(f"   Promoted: {result['promoted']} items")
            self.stdout.write(f"   Demoted: {result['demoted']} items")
            self.stdout.write(f"\n📊 Current distribution:")
            self.stdout.write(f"   Hot: {result['total_hot']} items")
            self.stdout.write(f"   Warm: {result['total_warm']} items")
            self.stdout.write(f"   Cold: {result['total_cold']} items")
    
    def show_status(self, tier_manager):
        """현재 상태 표시"""
        from apps.db.models_cloud import VideoAnalysis, Video
        
        # 전체 통계
        total_videos = Video.objects.count()
        total_analyses = VideoAnalysis.objects.count()
        
        # 계층별 통계
        hot_count = VideoAnalysis.objects.filter(storage_tier='hot').count()
        warm_count = VideoAnalysis.objects.filter(storage_tier='warm').count()
        cold_count = VideoAnalysis.objects.filter(storage_tier='cold').count()
        
        # 검색 통계
        from django.db.models import Avg, Max, Min
        search_stats = VideoAnalysis.objects.aggregate(
            avg_searches=Avg('search_count'),
            max_searches=Max('search_count'),
            min_searches=Min('search_count')
        )
        
        self.stdout.write("📈 System Status:")
        self.stdout.write(f"\n📹 Videos: {total_videos}")
        self.stdout.write(f"🔍 Total Analyses: {total_analyses}")
        
        self.stdout.write(f"\n🌡️  Data Distribution:")
        self.stdout.write(f"   🔥 Hot: {hot_count} ({hot_count/total_analyses*100:.1f}%)")
        self.stdout.write(f"   🌤️  Warm: {warm_count} ({warm_count/total_analyses*100:.1f}%)")
        self.stdout.write(f"   ❄️  Cold: {cold_count} ({cold_count/total_analyses*100:.1f}%)")
        
        self.stdout.write(f"\n🔍 Search Statistics:")
        self.stdout.write(f"   Average searches per item: {search_stats['avg_searches']:.1f}")
        self.stdout.write(f"   Most searched item: {search_stats['max_searches']} searches")
        self.stdout.write(f"   Least searched item: {search_stats['min_searches']} searches")