import XCTest
@testable import AppPackageBuilder

final class HomebrewModelsDecodingTests: XCTestCase {

    func testDecodesCaskJSON() throws {
        let json = """
        {
          "casks": [
            {
              "token": "visual-studio-code",
              "name": ["Visual Studio Code"],
              "desc": "Code editing. Redefined.",
              "homepage": "https://code.visualstudio.com/",
              "version": "1.87.2",
              "sha256": "abc123",
              "url": "https://update.code.visualstudio.com/1.87.2/darwin/stable",
              "artifacts": [ { "app": ["Visual Studio Code.app"] } ],
              "depends_on": {}
            }
          ],
          "formulae": []
        }
        """
        let response = try JSONDecoder().decode(BrewInfoV2Response.self, from: Data(json.utf8))
        let cask = try XCTUnwrap(response.casks?.first)
        XCTAssertEqual(cask.token, "visual-studio-code")
        XCTAssertEqual(cask.displayName, "Visual Studio Code")
        XCTAssertEqual(cask.appArtifactNames, ["Visual Studio Code.app"])
    }

    func testDecodesFormulaJSONWithoutService() throws {
        let json = """
        {
          "casks": [],
          "formulae": [
            {
              "name": "jq",
              "full_name": "jq",
              "desc": "Lightweight JSON processor",
              "homepage": "https://jqlang.github.io/jq/",
              "versions": { "stable": "1.7.1" },
              "urls": { "stable": { "url": "https://example.com/jq-1.7.1.tar.gz", "checksum": "deadbeef" } },
              "service": null
            }
          ]
        }
        """
        let response = try JSONDecoder().decode(BrewInfoV2Response.self, from: Data(json.utf8))
        let formula = try XCTUnwrap(response.formulae?.first)
        XCTAssertEqual(formula.versions?.stable, "1.7.1")
        XCTAssertFalse(formula.declaresService)
    }

    func testDecodesFormulaJSONWithService() throws {
        let json = """
        {
          "casks": [],
          "formulae": [
            {
              "name": "redis",
              "full_name": "redis",
              "desc": "Persistent key-value database",
              "homepage": "https://redis.io/",
              "versions": { "stable": "7.2.4" },
              "urls": { "stable": { "url": "https://example.com/redis-7.2.4.tar.gz", "checksum": "cafef00d" } },
              "service": { "run": ["redis-server"] }
            }
          ]
        }
        """
        let response = try JSONDecoder().decode(BrewInfoV2Response.self, from: Data(json.utf8))
        let formula = try XCTUnwrap(response.formulae?.first)
        XCTAssertTrue(formula.declaresService)
    }
}
