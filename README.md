# Discord Moderasyon Botu (coded by eieNN)

 Ban/Unban, mesaj temizleme ve kapsamlı loglama yapabilen Discord botu. Proje tamamen **eieNN** tarafından kodlandı.

## Özellikler
- `/setup yetkiliid`: Log kategorisi açar, dört adet metin kanalı oluşturur ve sadece belirtilen rol/üyenin görmesini sağlar.
- `/ban`, `/unban`, `/clear`: Temel moderasyon komutları; işlemler log kanallarına otomatik yazılır.
- Otomatik loglanan olaylar: Rol oluşturma/silme, kanal oluşturma/silme, ban/unban, kick, mesaj silme ve mesaj düzenleme.
- `data/logConfig.json` içinde sunucu bazlı konfigürasyon tutulur; komut tekrarlandığında eski yapı temizlenir.
- `/setstatus` ile ayarlanan durum `data/statusConfig.json` dosyasında saklanır; bot yeniden başlasa bile aynı metin/tip korunur.
- Mesaj silindiğinde ilgili kanala 5 saniye sonra kendini silen görsel embed gönderilir; log kanallarında döngü oluşmaması için atlanır.
- `OWNER_ID` ile belirtilen kişi `/setstatus` komutu ve `/ownerpanel` üzerinden botun durumunu ve çalışma halini kontrol eder.

## Gereksinimler
- Node.js 18+ (Discord.js v14 için zorunlu)
- Bir Discord bot uygulaması (https://discord.com/developers/applications)

## Kurulum
1. Depoyu klonlayın veya dosyaları indirin.
2. Bağımlılıkları kurun:
   ```bash
   npm install
   ```
3. `.env.example` dosyasını `.env` olarak kopyalayın ve aşağıdaki alanları doldurun:
   - `DISCORD_TOKEN`: Botun token değeri.
   - `CLIENT_ID`: Uygulama/Bot ID'si.
   - `GUILD_ID`: Slash komutlarının yükleneceği sunucu ID'si.
   - `OWNER_ID`: Botun durumunu/panelini kullanabilecek tek Discord kullanıcı ID'si.
4. Botu başlatın:
   ```bash
   npm start
   ```

İlk çalışmada slash komutları belirtilen sunucuya kaydedilir. ID'leri değiştirirseniz botu yeniden başlatmanız yeterlidir.

## Komut Özeti
- `/setup yetkiliid:<string>`: Log kategorisi ve kanalları kurar; ID rol veya kullanıcı olabilir.
- `/ban uye:<user> sebep?:<string> gecmismesajgunu?:<0-7>`: Kullanıcıyı yasaklar, isteğe bağlı geçmiş mesajlarını siler.
- `/unban uyeid:<string> sebep?:<string>`: Yasaklı kullanıcı ID'sinin yasağını kaldırır.
- `/clear adet:<1-100> sebep?:<string>`: Bulunulan kanalda toplu mesaj siler.
- Mesaj silme olayı gerçekleştiğinde kanal üzerinde halka açık bir embed paylaşılır ve 5 saniye sonra otomatik silinir.
- `/setstatus tip:<oynuyor|izliyor|dinliyor|yarışıyor> mesaj:<string>`: OWNER_ID kullanıcısı botun "Oynuyor" kısmını günceller.
- `/ownerpanel`: OWNER_ID kullanıcısına özel start/stop/restart düğmelerinin bulunduğu paneli açar.

## Log Kanalları
`/setup` çalıştırıldığında şu kanallar katagori altında oluşturulur:
- `rol-log`: Rol oluşturma/silme kayıtları
- `kanal-log`: Kanal oluşturma/silme kayıtları
- `uye-log`: Ban/Unban/Kick kayıtları
- `mesaj-log`: Mesaj silme ve düzenleme kayıtları

Bu kanalların ID'leri `data/logConfig.json` içinde saklanır. Kanallardan biri silinirse otomatik olarak konfigürasyondan kaldırılır; tekrar oluşturmak için `/setup` komutunu yeniden çalıştırabilirsiniz.

## Durum Kalıcılığı
- `/setstatus` komutu, seçilen tür ve metni `data/statusConfig.json` içine yazar.
- Bot kapatılıp açılsa bile bu dosya okunarak aynı "Oynuyor" bilgisi geri yüklenir.

## Mesaj Silme Bildirimi
- Her mesaj silindiğinde hem log kanalına kayıt düşülür hem de mesajın bulunduğu kanala GIF içeren embed atılır.
- Bu embed 5 saniye sonra otomatik kaldırılır; log kanalları hariç tüm kanallar bu bildirimi görür.

## Lisans
- Proje [MIT Lisansı](LICENSE) ile paylaşılmıştır ve tüm haklar **eieNN**'e aittir.

## Sahip Paneli
- `/ownerpanel` komutu sadece `OWNER_ID` ile belirtilen hesap tarafından çalıştırılabilir ve ephemeral bir buton paneli gösterir.
- `Stop` butonu moderasyon komutlarını ve loglamayı geçici olarak durdurur; `Start` tekrar aktif eder.
- `Restart` butonu botu kısa süreliğine yeniden bağlar ve slash komutlarını taze kaydeder.
- `/setstatus` komutu aynı kullanıcıya botun durum metnini/aktivite türünü değiştirme imkanı verir.
