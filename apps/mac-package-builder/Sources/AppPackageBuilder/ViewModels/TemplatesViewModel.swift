import Foundation

@MainActor
final class TemplatesViewModel: ObservableObject {
    @Published var templates: [PackageTemplate] = []

    private let templateService: TemplateServicing

    init(templateService: TemplateServicing = TemplateService()) {
        self.templateService = templateService
        reload()
    }

    func reload() {
        templates = templateService.loadAll()
    }

    func saveAsTemplate(name: String, summary: String, configuration: PackageConfiguration) {
        let template = PackageTemplate(name: name, summary: summary, configuration: configuration)
        templateService.save(template)
        reload()
    }

    func isBuiltIn(_ template: PackageTemplate) -> Bool {
        PackageTemplate.builtInSamples().contains { $0.name == template.name }
    }

    func remove(_ template: PackageTemplate) {
        guard !isBuiltIn(template) else { return }
        templateService.remove(id: template.id)
        reload()
    }
}
